import React from 'react';

/**
 * <Environment> loads its HDRI from an external CDN. If that fetch fails
 * (offline, ad-blocker, blocked third-party host, flaky network), the
 * rejection surfaces as a render error and — unhandled — takes down the
 * whole WebGL canvas, not just the reflections. Catch it here so a failed
 * environment load just means flatter lighting instead of a dead viewer.
 */
export default class EnvironmentBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('Environment map failed to load; continuing without it.', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
