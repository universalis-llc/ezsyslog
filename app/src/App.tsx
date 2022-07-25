import { Component } from 'solid-js';
import SyslogTable from './components/syslogTable';
import { createGlobalStyles } from "solid-styled-components";
import Dashboard from './pages/dashboard';

const GlobalStyles = () => {
  const Styles = createGlobalStyles`
    html,
    body {
      margin: 0;
      padding: 0;
      font-size: 0.95rem;
    }

    html {
      font-family: 'Fira Code', monospace;
    }
    @supports (font-variation-settings: normal) {
      html { font-family: 'Fira Code VF', monospace; }
    }

    * {
      box-sizing: border-box;
    }
  `;
  return <Styles />;
};

const App: Component = () => {
  return (
    <div>
      <GlobalStyles/>
      <Dashboard/>
    </div>
  );
};

export default App;
