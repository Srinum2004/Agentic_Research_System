export default function AgentActivity({ result }) {
    if (!result) {
        return (
            <div className="fade-in">
                <h1 className="hero-title">Agent Workflow</h1>
                <div className="card">
                    <h3 style={{ marginBottom: '1rem' }}>No Recent Activity</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Run a research query in the Dashboard to see real-time agent execution steps.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1 className="hero-title">Agent Workflow</h1>
            <div className="card">
                <h3 style={{ marginBottom: '1.5rem' }}>Execution Trace</h3>
                <div className="step-container">
                    {result.agent_steps && result.agent_steps.length > 0 ? (
                        result.agent_steps.map((step, index) => (
                            <div key={index} className="step-card fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                                {step}
                            </div>
                        ))
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>No steps recorded.</p>
                    )}
                </div>
            </div>

            <div className="card">
                <h3 style={{ marginBottom: '1.5rem' }}>Metadata & Payload</h3>
                <pre style={{
                    background: 'var(--bg-color)',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    overflowX: 'auto',
                    fontSize: '0.9rem',
                    color: 'var(--secondary-color)',
                    border: '1px solid var(--border-color)'
                }}>
                    {JSON.stringify(result, null, 2)}
                </pre>
            </div>
        </div>
    );
}
