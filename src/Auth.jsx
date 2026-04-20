import { useState } from 'react'
import { supabase } from './supabaseClient'

const FONT_KR = "'Apple SD Gothic Neo', 'AppleSDGothicNeo', -apple-system, sans-serif"
const FONT_EN = "'Helvetica Neue', Helvetica, Arial, sans-serif"

export default function Auth() {
  const [mode, setMode] = useState('login') // login, signup, forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setMessage(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setMessage('인증 메일을 보냈어요. 이메일을 확인해주세요!')
    setLoading(false)
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setError(error.message)
    else setMessage('비밀번호 재설정 메일을 보냈어요.')
    setLoading(false)
  }

  const handleGoogle = async () => {
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  const onSubmit = mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgot

  return (
    <div style={{
      fontFamily: FONT_KR,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7f7f7',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: '#fff',
        borderRadius: 24,
        padding: '40px 32px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#4a4660',
            margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#a5a1bb' }} />
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#e7f0d8' }} />
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#deede4' }} />
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#c8d1d0' }} />
            </div>
          </div>
          <div style={{ fontFamily: FONT_EN, fontSize: 11, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            papier priority
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#2d2d2d', margin: 0, letterSpacing: '-0.03em' }}>
            {mode === 'login' ? '로그인' : mode === 'signup' ? '회원가입' : '비밀번호 찾기'}
          </h1>
        </div>

        {/* Google Login */}
        <button onClick={handleGoogle} disabled={loading}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: 'none',
            background: '#f2f2f2', color: '#2d2d2d',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: FONT_KR, marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Google로 계속하기
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: '#eee' }} />
          <span style={{ fontSize: 11, color: '#bbb' }}>또는 이메일로</span>
          <div style={{ flex: 1, height: 1, background: '#eee' }} />
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#999', fontWeight: 600, display: 'block', marginBottom: 4 }}>이메일</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="name@example.com"
              style={{
                width: '100%', border: 'none', borderRadius: 12, padding: '12px 14px',
                fontSize: 14, fontFamily: FONT_EN, background: '#f2f2f2', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {mode !== 'forgot' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#999', fontWeight: 600, display: 'block', marginBottom: 4 }}>비밀번호</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="6자 이상"
                style={{
                  width: '100%', border: 'none', borderRadius: 12, padding: '12px 14px',
                  fontSize: 14, fontFamily: FONT_EN, background: '#f2f2f2', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(176,120,120,0.1)', color: '#b07878', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(106,155,131,0.1)', color: '#6a9b83', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {message}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
              background: loading ? '#999' : '#4a4660', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              fontFamily: FONT_KR, marginBottom: 16,
            }}>
            {loading ? '처리중...' : mode === 'login' ? '로그인' : mode === 'signup' ? '회원가입' : '재설정 메일 보내기'}
          </button>
        </form>

        {/* Mode switcher */}
        <div style={{ textAlign: 'center', fontSize: 13, color: '#999' }}>
          {mode === 'login' && (
            <>
              <span>계정이 없으신가요? </span>
              <button onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#4a4660', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_KR, fontSize: 13 }}>
                회원가입
              </button>
              <br />
              <button onClick={() => { setMode('forgot'); setError(null); setMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontFamily: FONT_KR, fontSize: 12, marginTop: 8, display: 'inline-block' }}>
                비밀번호를 잊으셨나요?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <span>이미 계정이 있으신가요? </span>
              <button onClick={() => { setMode('login'); setError(null); setMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#4a4660', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_KR, fontSize: 13 }}>
                로그인
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('login'); setError(null); setMessage(null); }}
              style={{ background: 'none', border: 'none', color: '#4a4660', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_KR, fontSize: 13 }}>
              로그인으로 돌아가기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
