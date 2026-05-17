import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, ArrowRight, Sparkles, BookOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import { papersApi } from './papersApi';

export default function PaperIntake() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const initialId = params.get('id');

    const [projectId, setProjectId] = useState(initialId ? Number(initialId) : null);
    const [project, setProject] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [role] = useState(localStorage.getItem('role') || 'user');
    const [presets, setPresets] = useState([]);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return;
        }
        (async () => {
            try {
                const { presets: list } = await papersApi.presets();
                setPresets(list || []);
            } catch (e) {
                // non-fatal; chat still works without chips
            }
            let id = projectId;
            if (!id) {
                const created = await papersApi.create();
                id = created.id;
                setProjectId(id);
            }
            const detail = await papersApi.get(id);
            setProject(detail.project);
            setMessages(detail.messages);
            if (detail.project.intent_complete) {
                navigate(`/papers/${id}`);
            }
        })();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, sending]);

    const sendMessage = async (text) => {
        if (!text || !projectId || sending) return;
        setSending(true);
        setMessages((prev) => [
            ...prev,
            { id: `tmp-${Date.now()}`, role: 'user', content: text, phase: 'intake' },
        ]);
        try {
            const resp = await papersApi.chat(projectId, text, { phase: 'intake' });
            setMessages((prev) => [
                ...prev,
                {
                    id: `tmp-${Date.now()}-a`,
                    role: 'assistant',
                    content: resp.reply,
                    phase: 'intake',
                },
            ]);
            setProject(resp.project);
            if (resp.intent_complete) {
                setTimeout(() => navigate(`/papers/${projectId}`), 700);
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    role: 'assistant',
                    content: 'Sorry, something went wrong. Please try again.',
                    phase: 'intake',
                },
            ]);
        } finally {
            setSending(false);
        }
    };

    const send = async (e) => {
        e?.preventDefault();
        const text = input.trim();
        if (!text) return;
        setInput('');
        await sendMessage(text);
    };

    const pickPreset = async (preset) => {
        // Send a natural-language pick — the intake LLM resolves the alias.
        await sendMessage(`I want to use the ${preset.name} format (${preset.key}).`);
    };

    const formatPicked = Boolean(project?.paper_format);

    return (
        <div className="layout">
            <Sidebar role={role} />
            <main className="main-content">
                <motion.header
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="page-header"
                >
                    <div>
                        <h1 className="hero-title">Tell me about your paper</h1>
                        <p className="text-muted">
                            Pick a paper format below, then share your topic and domain. The canvas opens automatically once we have all three.
                        </p>
                    </div>
                    {project?.intent_complete && (
                        <button className="btn btn-primary" onClick={() => navigate(`/papers/${projectId}`)}>
                            <ArrowRight size={18} /> Open Canvas
                        </button>
                    )}
                </motion.header>

                {!formatPicked && presets.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="format-picker"
                    >
                        <div className="format-picker-label">
                            <BookOpen size={14} /> Choose a paper format
                        </div>
                        <div className="format-picker-chips">
                            {presets.map((p) => (
                                <button
                                    key={p.key}
                                    type="button"
                                    className="format-chip"
                                    onClick={() => pickPreset(p)}
                                    disabled={sending}
                                    title={p.description}
                                >
                                    <span className="format-chip-name">{p.name}</span>
                                    <span className="format-chip-meta">
                                        {p.citation_style?.toUpperCase()} · {p.num_sections} sections
                                    </span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {formatPicked && (
                    <div className="format-picked-banner">
                        <BookOpen size={14} />
                        <span>
                            Format: <strong>{presets.find((p) => p.key === project.paper_format)?.name || project.paper_format}</strong>
                            {' · '}
                            Citation: <strong>{project.citation_style?.toUpperCase()}</strong>
                        </span>
                    </div>
                )}

                <div className="chat-pane card">
                    <div className="chat-scroll" ref={scrollRef}>
                        {messages.map((m) => (
                            <div key={m.id} className={`chat-bubble chat-${m.role}`}>
                                {m.role === 'assistant' && (
                                    <div className="chat-avatar"><Sparkles size={14} /></div>
                                )}
                                <div className="chat-text">{m.content}</div>
                            </div>
                        ))}
                        {sending && (
                            <div className="chat-bubble chat-assistant">
                                <div className="chat-avatar"><Sparkles size={14} /></div>
                                <div className="chat-text typing-dots">
                                    <span /><span /><span />
                                </div>
                            </div>
                        )}
                    </div>

                    <form onSubmit={send} className="chat-input-row">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={formatPicked ? 'Share your topic and domain…' : 'Pick a format above, or type your choice…'}
                            disabled={sending}
                        />
                        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
