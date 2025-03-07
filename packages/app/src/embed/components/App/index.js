// @flow
import * as React from 'react';
import { ThemeProvider } from 'styled-components';
import { camelizeKeys } from 'humps';
import getTemplateDefinition from '@codesandbox/common/lib/templates';
import type { Module, Sandbox } from '@codesandbox/common/lib/types';
import Centered from '@codesandbox/common/lib/components/flex/Centered';
import { getSandboxOptions } from '@codesandbox/common/lib/url';
import {
  findCurrentModule,
  findMainModule,
} from '@codesandbox/common/lib/sandbox/modules';
import { Title } from 'app/components/Title';
import { SubTitle } from 'app/components/SubTitle';
import Header from '../Header';
import Content from '../Content';
import Sidebar from '../Sidebar';
import { Container, Fullscreen, Moving } from './elements';

// Okay, this looks veeeery strange, we need this because Webpack has a bug currently
// that makes it think we have core-js/es6/map available in embed, but we don't.
// So we explicitly make sure that we have `core-js/es6/map` available by declaring
// new Map.
new Map(); // eslint-disable-line

type State = {
  notFound: boolean,
  sandbox: ?Sandbox,
  fontSize: number,
  showEditor: boolean,
  showPreview: boolean,
  previewWindow: string,
  isInProjectView: boolean,
  currentModule: string,
  initialPath: string,
  sidebarOpen: boolean,
  autoResize: boolean,
  hideNavigation: boolean,
  enableEslint: boolean,
  useCodeMirror: boolean,
  editorSize: number,
  forceRefresh: boolean,
  expandDevTools: boolean,
  runOnClick: boolean,
  verticalMode: boolean,
  highlightedLines: Array<number>,
  tabs?: Array<number>,
};

const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('safari')) {
    return !ua.includes('chrome');
  }

  return false;
};

export default class App extends React.PureComponent<
  {
    id?: string,
    embedOptions?: Object,
    sandbox?: any,
  },
  State
> {
  constructor(props) {
    super(props);

    const {
      currentModule,
      initialPath,
      isInProjectView,
      isPreviewScreen,
      isEditorScreen,
      previewWindow,
      isSplitScreen,
      autoResize,
      hideNavigation,
      fontSize,
      enableEslint,
      useCodeMirror,
      editorSize,
      highlightedLines,
      forceRefresh,
      expandDevTools,
      runOnClick,
      verticalMode = window.innerWidth < window.innerHeight,
      tabs,
    } = props.embedOptions || getSandboxOptions(document.location.href);

    this.state = {
      notFound: false,
      sandbox: this.props.sandbox || null,
      fontSize: fontSize || 16,
      showEditor: isSplitScreen || isEditorScreen,
      showPreview: isSplitScreen || isPreviewScreen,
      previewWindow,
      isInProjectView,
      currentModule,
      initialPath,
      sidebarOpen: false,
      autoResize,
      hideNavigation,
      enableEslint,
      useCodeMirror,
      editorSize,
      forceRefresh,
      expandDevTools,
      tabs,
      runOnClick:
        runOnClick === false
          ? false
          : runOnClick ||
            navigator.appVersion.includes('X11') ||
            navigator.appVersion.includes('Linux') ||
            isSafari(),
      verticalMode,
      highlightedLines: highlightedLines || [],
    };
  }

  getId = () => {
    if (this.props.id) {
      return this.props.id;
    }

    if (this.props.sandbox) {
      return this.props.sandbox.id;
    }

    const matches = location.pathname.match(/^\/embed\/(.*?)$/);

    if (matches && matches.length > 1) {
      return matches[1];
    }
    return null;
  };

  getAppOrigin = () => location.origin.replace('embed.', '');

  fetchSandbox = async (id: string) => {
    if (id === 'custom') {
      await new Promise(resolve => {
        window.parent.postMessage('ready', '*');
        window.addEventListener('message', e => {
          if (e.data && e.data.sandbox) {
            this.setState({
              sandbox: e.data.sandbox,
            });

            resolve();
          }
        });
      });
    } else {
      try {
        const response = await fetch(
          `${this.getAppOrigin()}/api/v1/sandboxes/${id}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.jwt()}`,
            },
          }
        )
          .then(res => res.json())
          .then(camelizeKeys);

        document.title = `${response.data.title ||
          response.data.id} - CodeSandbox`;

        this.setState({ sandbox: response.data });
      } catch (e) {
        this.setState({ notFound: true });
      }
    }
  };

  UNSAFE_componentWillMount() {
    if (window.__SANDBOX_DATA__) {
      this.setState({ sandbox: camelizeKeys(window.__SANDBOX_DATA__) });
    } else {
      const id = this.getId();

      if (!id) {
        this.setState({ notFound: true });
        return;
      }

      this.fetchSandbox(id);
    }
  }

  setEditorView = () => this.setState({ showEditor: true, showPreview: false });
  setPreviewView = () =>
    this.setState({ showEditor: false, showPreview: true });
  setMixedView = () => this.setState({ showEditor: true, showPreview: true });

  setCurrentModule = (id: string) => {
    const newState: {
      currentModule: string,
      showEditor?: boolean,
      showPreview?: boolean,
    } = { currentModule: id };

    if (!this.state.showEditor) {
      newState.showEditor = true;
      if (this.state.showPreview) {
        // Means that the user was only looking at preview, which suggests that the screen is small.
        newState.showPreview = false;
      }
    }

    this.setState(newState);
  };

  toggleSidebar = () => this.setState({ sidebarOpen: !this.state.sidebarOpen });

  // eslint-disable-next-line
  setProjectView = (sandboxId?: ?string, isOpen: boolean, cb: Function) => {
    return this.setState({ isInProjectView: isOpen }, cb);
  };

  getCurrentModuleFromPath = (sandbox: Sandbox): Module => {
    const { currentModule: currentModulePath } = this.state;

    return (
      findCurrentModule(
        sandbox.modules,
        sandbox.directories,
        currentModulePath,
        findMainModule(sandbox.modules, sandbox.directories, sandbox.entry)
      ) || sandbox.modules[0]
    );
  };

  jwt = () => {
    try {
      return JSON.parse(localStorage.getItem('jwt'));
    } catch (e) {
      return undefined;
    }
  };

  toggleLike = () => {
    const jwt = this.jwt();

    if (this.state.sandbox.userLiked && jwt) {
      this.setState(s => ({
        sandbox: {
          ...s.sandbox,
          userLiked: false,
          likeCount: s.sandbox.likeCount - 1,
        },
      }));
      fetch(`/api/v1/sandboxes/${this.state.sandbox.id}/likes`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          id: this.state.sandbox.id,
        }),
      })
        .then(x => x.json())
        .then(() => {
          this.setState(s => ({
            sandbox: {
              ...s.sandbox,
              userLiked: false,
              likeCount: s.sandbox.likeCount - 1,
            },
          }));
        })
        .catch(() => {
          this.setState(s => ({
            sandbox: {
              ...s.sandbox,
              userLiked: true,
              likeCount: s.sandbox.likeCount + 1,
            },
          }));
        });
    } else {
      this.setState(s => ({
        sandbox: {
          ...s.sandbox,
          userLiked: true,
          likeCount: s.sandbox.likeCount + 1,
        },
      }));
      fetch(`/api/v1/sandboxes/${this.state.sandbox.id}/likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
      })
        .then(x => x.json())
        .then(res => {
          this.setState(s => ({
            sandbox: { ...s.sandbox, userLiked: true, likeCount: res.count },
          }));
        })
        .catch(() => {
          this.setState(s => ({
            sandbox: {
              ...s.sandbox,
              userLiked: false,
              likeCount: s.sandbox.likeCount - 1,
            },
          }));
        });
    }
  };

  content = () => {
    if (this.state.notFound) {
      return (
        <Centered vertical horizontal>
          <Title delay={0.1}>Not Found</Title>
          <SubTitle delay={0.05}>
            We could not find the sandbox you
            {"'"}
            re looking for.
          </SubTitle>
        </Centered>
      );
    }

    const sandbox = this.state.sandbox;

    if (!sandbox) {
      return (
        <Centered vertical horizontal>
          <Title delay={0.3}>Loading Sandbox...</Title>
        </Centered>
      );
    }

    const {
      showEditor,
      verticalMode,
      showPreview,
      previewWindow,
      isInProjectView,
      runOnClick,
    } = this.state;

    return (
      <ThemeProvider
        theme={{
          templateColor: getTemplateDefinition(sandbox.template).color,
        }}
      >
        <Container>
          <Header
            showEditor={showEditor}
            showPreview={showPreview}
            setEditorView={this.setEditorView}
            setPreviewView={this.setPreviewView}
            setMixedView={this.setMixedView}
            sandbox={sandbox}
            toggleSidebar={this.toggleSidebar}
            toggleLike={this.jwt() && this.toggleLike}
            liked={sandbox.userLiked}
          />
          <Content
            showEditor={showEditor}
            showPreview={showPreview}
            previewWindow={previewWindow}
            isInProjectView={isInProjectView}
            setProjectView={this.setProjectView}
            sandbox={sandbox}
            currentModule={this.getCurrentModuleFromPath(sandbox)}
            hideNavigation={this.state.hideNavigation}
            autoResize={this.state.autoResize}
            fontSize={this.state.fontSize}
            initialPath={this.state.initialPath}
            setCurrentModule={this.setCurrentModule}
            useCodeMirror={this.state.useCodeMirror}
            enableEslint={this.state.enableEslint}
            editorSize={this.state.editorSize}
            highlightedLines={this.state.highlightedLines}
            forceRefresh={this.state.forceRefresh}
            expandDevTools={this.state.expandDevTools}
            tabs={this.state.tabs}
            runOnClick={runOnClick}
            verticalMode={verticalMode}
          />
        </Container>
      </ThemeProvider>
    );
  };

  render() {
    const sandbox = this.state.sandbox;

    return (
      <Fullscreen sidebarOpen={this.state.sidebarOpen}>
        {sandbox && (
          <Sidebar
            setCurrentModule={this.setCurrentModule}
            currentModule={this.getCurrentModuleFromPath(sandbox).id}
            sandbox={sandbox}
          />
        )}
        <Moving sidebarOpen={this.state.sidebarOpen}>{this.content()}</Moving>
      </Fullscreen>
    );
  }
}
