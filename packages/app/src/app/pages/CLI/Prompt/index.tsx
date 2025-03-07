import React from 'react';
import { Button } from '@codesandbox/common/lib/components/Button';
import { Title } from 'app/components/Title';
import { SubTitle } from 'app/components/SubTitle';
import { Container, Buttons, TokenContainer } from './elements';

interface IPromptProps {
  error: string;
  token: string;
  loading: boolean;
  username: string;
  signIn: () => void;
}

const select = ({ target }: { target: any }) => target.select();

const Prompt: React.FC<IPromptProps> = ({
  error,
  token,
  loading,
  username,
  signIn,
}) => {
  if (error) {
    return (
      <Container>
        <Title>An error occured:</Title>

        <SubTitle>{error}</SubTitle>

        <Buttons>
          <Button href="/?from-app=1">Go to homepage</Button>
        </Buttons>
      </Container>
    );
  }

  if (!username) {
    return (
      <Container>
        <Title>Welcome to CodeSandbox!</Title>

        <SubTitle>
          You need to sign in with your GitHub account to use the CLI.
        </SubTitle>

        <Buttons>
          <Button onClick={signIn}>Sign in with GitHub</Button>
        </Buttons>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <Title>Fetching authorization key...</Title>
      </Container>
    );
  }

  return (
    <Container>
      <Title>Hello {username}!</Title>

      <SubTitle>
        The CLI needs authorization to work.
        <br />
        Please paste the following code in the CLI:
      </SubTitle>

      <TokenContainer onClick={select} value={token} />
    </Container>
  );
};

export default Prompt;
