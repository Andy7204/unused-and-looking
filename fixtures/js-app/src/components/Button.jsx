// TRAP: used only in JSX from another file -> alive
export function Button({ label, onClick }) {
  return <button onClick={onClick}>{label}</button>;
}

// ORPHAN: exported, never imported, never rendered
export function GhostButton({ label }) {
  return <button className="ghost">{label}</button>;
}

// TRAP: class component lifecycle methods are called by React
export class Clock extends React.Component {
  componentDidMount() {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    this.setState({ now: Date.now() });
  }

  render() {
    return <time>{this.state.now}</time>;
  }

  // ORPHAN-ish: private method nobody calls (lower confidence: class extends)
  #formatOld(ts) {
    return new Date(ts).toUTCString();
  }
}
