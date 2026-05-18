import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Password input matching the .input-with-icon style used across auth pages.
 * Renders the leading lock icon, the input, and a trailing eye toggle that
 * flips between hidden/visible without remounting the field (so autofill +
 * password managers keep working).
 */
export default function PasswordInput({
    id,
    value,
    onChange,
    placeholder,
    autoComplete = 'current-password',
    required = false,
    minLength,
    leadingIcon: LeadingIcon = Lock,
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="input-with-icon">
            <LeadingIcon size={18} />
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete={autoComplete}
                required={required}
                minLength={minLength}
            />
            <button
                type="button"
                className="password-toggle"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                tabIndex={-1}
            >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
}
