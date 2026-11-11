import { useState } from 'react'

// Password field with a Show/Hide toggle
export default function PasswordInput({ id, value, onChange, autoComplete = 'current-password', minLength }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw">
      <input id={id} type={show ? 'text' : 'password'} required value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
