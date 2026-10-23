import { Component, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

type Props = { children: ReactNode; onReset: () => void };
type State = { failed: boolean };

export default class EditorErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Nyxcord editor error', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="alert-banner" role="alert">
      <CircleAlert size={18}/><span>Editor could not display this media.</span>
      <button type="button" onClick={() => {
        this.props.onReset();
        this.setState({ failed: false });
      }}>Reset editor</button>
    </div>;
  }
}
