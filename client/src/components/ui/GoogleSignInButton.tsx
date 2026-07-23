import { GoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { setToken, setUser } from '../../lib/auth'

// Renders Google's sign-in button and exchanges the credential for our JWT.
export default function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const navigate = useNavigate()

  return (
    <GoogleLogin
      onSuccess={async (cred) => {
        try {
          const { data } = await api.post('/auth/google', { credential: cred.credential })
          setToken(data.token)
          setUser(data.user)
          navigate('/')
        } catch {
          onError?.('Google sign-in failed')
        }
      }}
      onError={() => onError?.('Google sign-in failed')}
      width="320"
    />
  )
}
