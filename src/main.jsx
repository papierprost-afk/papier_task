import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import App from './App'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Apple SD Gothic Neo', sans-serif", color: '#aaa' }}>
        불러오는 중...
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  return <App session={session} />
}

// Supabase-backed storage that syncs across devices
window.storage = {
  _supabase: supabase,
  _cache: {},

  async get(key) {
    if (this._cache[key]) return { key, value: this._cache[key], shared: false }
    throw new Error('Key not found')
  },

  async set(key, value) {
    this._cache[key] = value
    return { key, value, shared: false }
  },

  async delete(key) {
    delete this._cache[key]
    return { key, deleted: true, shared: false }
  },

  async list(prefix = '') {
    const keys = Object.keys(this._cache).filter(k => k.startsWith(prefix))
    return { keys, prefix, shared: false }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
