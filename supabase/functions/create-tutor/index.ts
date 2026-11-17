// Lets an admin create a login with a temporary password from the dashboard.
// Tutors by default; pass student_id to create a student's login and link it to their record.
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
  if (me?.role !== 'admin') return reply({ error: 'Only admins can add logins' }, 403)

  const { email, password, full_name, student_id } = await req.json()
  if (!email || !full_name) return reply({ error: 'Name and email are required' }, 400)
  if (!password || password.length < 8) return reply({ error: 'Temporary password must be at least 8 characters' }, 400)
  if (student_id) {
    const { data: s } = await db.from('students').select('user_id').eq('id', student_id).single()
    if (!s) return reply({ error: 'Student not found' }, 404)
    if (s.user_id) return reply({ error: 'This student already has a login' }, 400)
  }

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
  if (error) return reply({ error: error.message.includes('already') ? 'An account with this email already exists' : error.message }, 400)
  const id = data.user.id

  if (student_id) {
    const a = await db.from('profiles').update({ role: 'student' }).eq('id', id)
    const b = await db.from('students').update({ user_id: id, email }).eq('id', student_id)
    if (a.error || b.error) {
      await db.auth.admin.deleteUser(id) // undo so the admin can retry cleanly
      return reply({ error: (a.error || b.error)!.message }, 500)
    }
  }
  return reply({ id })
})
