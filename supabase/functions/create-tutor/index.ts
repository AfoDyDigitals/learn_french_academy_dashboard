// Lets an admin create a tutor account with a temporary password from the dashboard.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Only signed-in admins may create accounts
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return reply({ error: 'Not signed in' }, 401)
  const { data: me } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return reply({ error: 'Only admins can add tutors' }, 403)

  const { email, password, full_name } = await req.json()
  if (!email || !full_name) return reply({ error: 'Name and email are required' }, 400)
  if (!password || password.length < 8) return reply({ error: 'Temporary password must be at least 8 characters' }, 400)

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
  if (error) return reply({ error: error.message.includes('already') ? 'An account with this email already exists' : error.message }, 400)
  return reply({ id: data.user.id })
})
