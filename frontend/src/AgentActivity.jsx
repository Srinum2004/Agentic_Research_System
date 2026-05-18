const flowStyles = `
@keyframes flow-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(33, 113, 233, 0.5); }
    50% { transform: scale(1.04); box-shadow: 0 0 0 12px rgba(33, 113, 233, 0); }
}
@keyframes flow-dash {
    to { stroke-dashoffset: -24; }
}
@keyframes float-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
@keyframes pop-in {
    0% { opacity: 0; transform: scale(0.6) translateY(10px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
}
.flow-node {
    animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.flow-node-icon {
    animation: float-bob 3s ease-in-out infinite;
}
.flow-node.active .flow-node-icon-wrap {
    animation: flow-pulse 2.2s ease-in-out infinite;
}
.flow-connector path {
    stroke-dasharray: 8 6;
    animation: flow-dash 1.2s linear infinite;
}
.meta-chip {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.meta-chip:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
}
`;

function NodeIcon({ emoji, color }) {
    return (
        <div className="flow-node-icon-wrap" style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${color}33, ${color}11)`,
            border: `2px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.2rem',
            position: 'relative',
        }}>
            <span className="flow-node-icon" role="img" aria-hidden>{emoji}</span>
        </div>
    );
}

function FlowNode({ emoji, color, label, sub, active, delay }) {
    return (
        <div className={`flow-node ${active ? 'active' : ''}`} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.6rem',
            minWidth: '140px',
            animationDelay: `${delay}s`,
        }}>
            <NodeIcon emoji={emoji} color={color} />
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-color)' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
            </div>
        </div>
    );
}

function Connector() {
    return (
        <svg className="flow-connector" width="60" height="40" viewBox="0 0 60 40" style={{ flexShrink: 0 }}>
            <defs>
                <linearGradient id="grad-line" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#2171E9" />
                    <stop offset="100%" stopColor="#22BEE8" />
                </linearGradient>
            </defs>
            <path d="M 4 20 L 50 20" stroke="url(#grad-line)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M 46 14 L 54 20 L 46 26" stroke="url(#grad-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

function MetaChip({ icon, label, value, accent }) {
    return (
        <div className="meta-chip" style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            flex: '1 1 200px',
        }}>
            <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: `${accent}22`,
                border: `1px solid ${accent}55`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                flexShrink: 0,
            }}>{icon}</div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-color)', fontWeight: 600, marginTop: '2px', wordBreak: 'break-word' }}>{value}</div>
            </div>
        </div>
    );
}

function formatTime(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
}

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

    const usedWebSearch = result.used_web_search;
    const nodes = [
        { emoji: '💬', color: '#2171E9', label: 'User Query', sub: 'Intent received' },
        { emoji: '🧠', color: '#8b5cf6', label: 'Intent Analysis', sub: 'Planner agent' },
        usedWebSearch
            ? { emoji: '🔍', color: '#22BEE8', label: 'Web Search', sub: 'SerpAPI' }
            : { emoji: '📚', color: '#22BEE8', label: 'Knowledge Base', sub: 'Internal context' },
        { emoji: '⚡', color: '#f59e0b', label: 'Groq Reasoning', sub: 'Llama 4 Scout' },
        { emoji: '✨', color: '#10b981', label: 'Response', sub: 'Delivered' },
    ];

    const outputPreview = typeof result.output === 'string'
        ? (result.output.length > 280 ? result.output.slice(0, 280) + '…' : result.output)
        : '';

    return (
        <div className="fade-in">
            <style>{flowStyles}</style>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <h3 style={{ margin: 0 }}>AI Agent Workflow</h3>
                    <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border-color)',
                        padding: '0.3rem 0.7rem',
                        borderRadius: '999px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                    }}>Live Run</span>
                </div>
                <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.8rem', fontSize: '0.9rem' }}>
                    Visual journey of how your query traveled through the agent pipeline.
                </p>

                <div style={{
                    background: 'linear-gradient(135deg, rgba(33,113,233,0.06), rgba(34,190,232,0.04))',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '2rem 1.2rem',
                    overflowX: 'auto',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        minWidth: 'fit-content',
                    }}>
                        {nodes.map((n, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <FlowNode {...n} active delay={i * 0.15} />
                                {i < nodes.length - 1 && <Connector />}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{
                    marginTop: '1.8rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.8rem',
                }}>
                    <MetaChip icon="❓" label="Query" value={result.query || '—'} accent="#2171E9" />
                    <MetaChip icon="⏱️" label="Execution Time" value={result.execution_time || '—'} accent="#f59e0b" />
                    <MetaChip icon={usedWebSearch ? '🌐' : '🔒'} label="Web Search" value={usedWebSearch ? 'Enabled' : 'Disabled'} accent="#22BEE8" />
                    <MetaChip icon="🚀" label="Started" value={formatTime(result.start_time)} accent="#8b5cf6" />
                    <MetaChip icon="🏁" label="Completed" value={formatTime(result.end_time)} accent="#10b981" />
                    <MetaChip icon="📊" label="Steps" value={(result.agent_steps?.length ?? 0) + ' stages'} accent="#f43f5e" />
                </div>

                {outputPreview && (
                    <div style={{
                        marginTop: '1.4rem',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.1rem 1.2rem',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                        }}>
                            <span>💡</span><span>Output Preview</span>
                        </div>
                        <div style={{ color: 'var(--text-color)', fontSize: '0.92rem', lineHeight: 1.55 }}>
                            {outputPreview}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
