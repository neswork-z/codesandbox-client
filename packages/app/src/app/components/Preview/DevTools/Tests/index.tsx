import { messages } from '@codesandbox/common/lib/utils/jest-lite';
import { actions, dispatch, listen } from 'codesandbox-api';
import immer from 'immer';
import { debounce } from 'lodash-es';
import React from 'react';
import SplitPane from 'react-split-pane';

import { DevToolProps } from '../';

import { Container, TestDetails, TestContainer } from './elements';
import TestElement from './TestElement';
import TestDetailsContent from './TestDetails';
import TestSummary from './TestSummary';
import TestOverview from './TestOverview';

export type IMessage = {
  type: 'message' | 'command' | 'return';
  logType: 'log' | 'warn' | 'info' | 'error';
  arguments: any[];
};

export type Status = 'idle' | 'running' | 'pass' | 'fail';

export type TestError = Error & {
  matcherResult?: boolean;
  mappedErrors?: Array<{
    fileName: string;
    _originalFunctionName: string;
    _originalColumnNumber: number;
    _originalLineNumber: number;
    _originalScriptCode: Array<{
      lineNumber: number;
      content: string;
      highlight: boolean;
    }> | null;
  }>;
};

export type Test = {
  testName: string[];
  duration: number | undefined;
  status: Status;
  errors: TestError[];
  running: boolean;
  path: string;
};

export type File = {
  fileName: string;
  fileError?: TestError;
  tests: {
    [testName: string]: Test;
  };
};

type State = {
  selectedFilePath: string | undefined;
  fileExpansionState: {
    [path: string]: Boolean;
  };
  files: {
    [path: string]: File;
  };
  running: boolean;
  watching: boolean;
};

type SandboxMessage =
  | CompilationDoneMessage
  | ({ type: 'test' } & (
      | InitializedTestsMessage
      | TestCountMessage
      | TotalTestStartMessage
      | TotalTestEndMessage
      | AddFileMessage
      | RemoveFileMessage
      | FileErrorMessage
      | DescribeStartMessage
      | DescribeEndMessage
      | AddTestMessage
      | TestStartMessage
      | TestEndMessage
    ));

interface InitializedTestsMessage {
  event: messages.INITIALIZE;
}

interface CompilationDoneMessage {
  type: 'done';
  compilatonError: boolean;
}

interface TestCountMessage {
  event: 'test_count';
  count: number;
}

interface TotalTestStartMessage {
  event: messages.TOTAL_TEST_START;
}

interface TotalTestEndMessage {
  event: messages.TOTAL_TEST_END;
}

interface AddFileMessage {
  event: messages.ADD_FILE;
  path: string;
}

interface RemoveFileMessage {
  event: messages.REMOVE_FILE;
  path: string;
}

interface FileErrorMessage {
  event: messages.FILE_ERROR;
  path: string;
  error: TestError;
}

interface DescribeStartMessage {
  event: messages.DESCRIBE_START;
  blockName: string;
}

interface DescribeEndMessage {
  event: messages.DESCRIBE_END;
}

interface AddTestMessage {
  event: messages.ADD_TEST;
  testName: string;
  path: string;
}

type TestMessage = Test & {
  blocks: string[];
  name: string;
  path: string;
};

interface TestStartMessage {
  event: messages.TEST_START;
  test: TestMessage;
}

interface TestEndMessage {
  event: messages.TEST_END;
  test: TestMessage;
}

const INITIAL_STATE = {
  files: {},
  selectedFilePath: null,
  fileExpansionState: {},
  running: true,
  watching: true,
};

class Tests extends React.Component<DevToolProps, State> {
  state = INITIAL_STATE;

  listener: () => void;
  currentDescribeBlocks: string[] = [];

  componentDidMount() {
    this.listener = listen(this.handleMessage);
  }

  componentWillUnmount() {
    if (this.listener) {
      this.listener();
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps: DevToolProps) {
    if (nextProps.sandboxId !== this.props.sandboxId) {
      this.setState({
        files: {},
        selectedFilePath: null,
        running: true,
      });
    }

    if (this.props.hidden && !nextProps.hidden) {
      this.runAllTests();
    }
  }

  selectFile = (file: File) => {
    this.setState({
      selectedFilePath:
        file.fileName === this.state.selectedFilePath ? null : file.fileName,
    });
  };

  toggleFileExpansion = (file: File) => {
    this.setState(
      immer(this.state, state => {
        state.fileExpansionState[file.fileName] = !state.fileExpansionState[
          file.fileName
        ];
      })
    );
  };

  handleMessage = (data: SandboxMessage) => {
    if (data.type === 'done' && this.state.watching && !this.props.hidden) {
      let delay = 1000;

      if (data.compilatonError) {
        delay *= 2;
      }

      // avoid to often test run in file watching mode,
      // very frequent test runs cause screen freezing
      debounce(
        () => {
          this.runAllTests();
        },
        delay,
        { maxWait: 4 * delay }
      )();
    } else if (data.type === 'test') {
      switch (data.event) {
        case messages.INITIALIZE: {
          this.currentDescribeBlocks = [];
          if (this.props.updateStatus) {
            this.props.updateStatus('clear');
          }
          this.setState(INITIAL_STATE);
          break;
        }
        case 'test_count': {
          const { updateStatus } = this.props;
          if (updateStatus) {
            updateStatus('clear');
            updateStatus('info', data.count);
          }
          break;
        }
        case messages.TOTAL_TEST_START: {
          this.currentDescribeBlocks = [];
          if (this.props.updateStatus) {
            this.props.updateStatus('clear');
          }
          this.setState({
            ...this.state,
            running: true,
          });
          break;
        }
        case messages.TOTAL_TEST_END: {
          this.setState({
            ...this.state,
            running: false,
          });

          const files = Object.keys(this.state.files);
          const failingTests = files.filter(
            f => this.getStatus(this.state.files[f]) === 'fail'
          ).length;
          const passingTests = files.filter(
            f => this.getStatus(this.state.files[f]) === 'pass'
          ).length;

          if (this.props.updateStatus) {
            if (failingTests > 0) {
              this.props.updateStatus('error', failingTests);
            } else if (passingTests === files.length) {
              this.props.updateStatus('success', passingTests);
            } else {
              // Not all tests are run
              this.props.updateStatus('warning', files.length - passingTests);
            }
          }

          break;
        }

        case messages.ADD_FILE: {
          this.setState(
            immer(this.state, state => {
              state.files[data.path] = {
                tests: {},
                fileName: data.path,
              };

              state.fileExpansionState[data.path] = true;
            })
          );
          break;
        }
        case 'remove_file': {
          this.setState(
            immer(this.state, state => {
              if (state.files[data.path]) {
                delete state.files[data.path];
              }

              delete state.fileExpansionState[data.path];
            })
          );
          break;
        }
        case messages.FILE_ERROR: {
          this.setState(
            immer(this.state, state => {
              if (state.files[data.path]) {
                state.files[data.path].fileError = data.error;
              }
            })
          );
          break;
        }
        case messages.DESCRIBE_START: {
          this.currentDescribeBlocks.push(data.blockName);
          break;
        }
        case messages.DESCRIBE_END: {
          this.currentDescribeBlocks.pop();
          break;
        }
        case messages.ADD_TEST: {
          const testName = [...this.currentDescribeBlocks, data.testName];

          this.setState(
            immer(this.state, state => {
              if (!state.files[data.path]) {
                state.files[data.path] = {
                  tests: {},
                  fileName: data.path,
                };

                state.fileExpansionState[data.path] = true;
              }

              state.files[data.path].tests[testName.join('||||')] = {
                status: 'idle',
                errors: [],
                testName,
                path: data.path,
              };
            })
          );
          break;
        }
        case messages.TEST_START: {
          const test = data.test;
          const testName = [...test.blocks, test.name];

          this.setState(
            immer(this.state, state => {
              if (!state.files[test.path]) {
                state.files[test.path] = {
                  tests: {},
                  fileName: test.path,
                };
              }

              const currentTest =
                state.files[test.path].tests[testName.join('||||')];
              if (!currentTest) {
                state.files[test.path].tests[testName.join('||||')] = {
                  status: 'running',
                  running: true,
                  testName,
                  path: test.path,
                };
              } else {
                currentTest.status = 'running';
                currentTest.running = true;
              }
            })
          );
          break;
        }
        case messages.TEST_END: {
          const test = data.test;
          const testName = [...test.blocks, test.name];

          this.setState(
            immer(this.state, state => {
              const existingTest =
                state.files[test.path].tests[testName.join('||||')];

              if (existingTest) {
                existingTest.status = test.status;
                existingTest.running = false;
                existingTest.errors = test.errors;
                existingTest.duration = test.duration;
              } else {
                state.files[test.path].tests[testName.join('||||')] = {
                  status: test.status,
                  running: false,
                  errors: test.errors,
                  duration: test.duration,
                  testName,
                  path: test.path,
                };
              }
            })
          );
          break;
        }
        default: {
          break;
        }
      }
    }
  };

  _lastFiles: {
    [path: string]: {
      file: File;
      status: Status;
    };
  } = {};
  getStatus = (file: File | undefined): Status => {
    if (file == null) {
      return 'idle';
    }

    const lastFile = this._lastFiles[file.fileName];

    // Simple memoization
    if (lastFile && file === lastFile.file && lastFile.status != null) {
      return lastFile.status;
    }

    if (file.fileError) {
      return 'fail';
    }

    const tests = file.tests;
    const status = Object.keys(tests).reduce(
      (prev: Status, next: Status): Status => {
        const test = tests[next];
        if (test.status !== 'idle' && prev === 'idle') {
          return test.status;
        }

        if (test.status === 'pass' || prev !== 'pass') {
          return prev;
        }

        if (test.status === 'fail') {
          return 'fail';
        }

        if (test.status === 'running') {
          return 'running';
        }

        return prev;
      },
      'idle'
    ) as Status;

    this._lastFiles[file.fileName] = { file, status };

    return status;
  };

  toggleWatching = () => {
    dispatch({
      type: 'set-test-watching',
      watching: !this.state.watching,
    });
    this.setState({ watching: !this.state.watching });
  };

  runAllTests = () => {
    this.setState({ files: {} }, () => {
      dispatch({
        type: 'run-all-tests',
      });
    });
  };

  runTests = (file: File) => {
    this.setState(
      immer(this.state, state => {
        state.files[file.fileName].tests = {};
      }),
      () => {
        dispatch({
          type: 'run-tests',
          path: file.fileName,
        });
      }
    );
  };

  openFile = (path: string) => {
    dispatch(actions.editor.openModule(path));
  };

  render() {
    if (this.props.hidden) {
      return null;
    }

    const { selectedFilePath } = this.state;
    const selectedFile = this.state.files[selectedFilePath || ''];

    const fileStatuses = {};
    Object.keys(this.state.files).forEach(path => {
      fileStatuses[path] = this.getStatus(this.state.files[path]);
    });

    const tests = [];
    Object.keys(this.state.files).forEach(path => {
      const file = this.state.files[path];
      Object.keys(file.tests).forEach(t => {
        tests.push(file.tests[t]);
      });
    });

    // Types for split-pane don't work because they're in root.
    const TSplitPane = SplitPane as any;
    return (
      <Container>
        <TSplitPane split="horizontal" defaultSize={'50%'}>
          <TestContainer>
            <TestSummary
              running={this.state.running}
              watching={this.state.watching}
              toggleWatching={this.toggleWatching}
              runAllTests={this.runAllTests}
              fileStatuses={fileStatuses}
              files={this.state.files}
              tests={tests}
            />

            <div style={{ marginTop: '1rem' }}>
              {Object.keys(this.state.files)
                .sort()
                .map(fileName => (
                  <TestElement
                    selectFile={this.selectFile}
                    selectedFile={selectedFile}
                    file={this.state.files[fileName]}
                    status={fileStatuses[fileName]}
                    key={fileName}
                    runTests={this.runTests}
                    openFile={this.openFile}
                    isExpanded={this.state.fileExpansionState[fileName]}
                    onFileExpandToggle={this.toggleFileExpansion}
                  />
                ))}
            </div>
          </TestContainer>
          <TestDetails>
            {selectedFile ? (
              <TestDetailsContent
                status={this.getStatus(selectedFile)}
                file={selectedFile}
                openFile={this.openFile}
                runTests={this.runTests}
              />
            ) : (
              <TestOverview tests={tests} openFile={this.openFile} />
            )}
          </TestDetails>
        </TSplitPane>
      </Container>
    );
  }
}

export default {
  id: 'codesandbox.tests',
  title: 'Tests',
  Content: Tests,
  actions: [],
};
