import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('INVITATION_FROM_EMAIL');
  const appUrl = Deno.env.get('APP_PUBLIC_URL');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response('Supabase function environment is incomplete.', { status: 500, headers: corsHeaders });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return new Response('Authentication required.', { status: 401, headers: corsHeaders });
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return new Response('Invalid user session.', { status: 401, headers: corsHeaders });

  const { invitationId } = await request.json().catch(() => ({}));
  if (typeof invitationId !== 'string') return new Response('Invitation ID is required.', { status: 400, headers: corsHeaders });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: invitation, error: invitationError } = await admin
    .from('trip_invitations')
    .select('id, trip_id, inviter_id, invitee_user_id, email, status, expires_at, email_sent_at, trips(name, start_date, end_date), inviter:profiles!trip_invitations_inviter_id_fkey(display_name)')
    .eq('id', invitationId)
    .maybeSingle();
  if (invitationError) {
    console.error('Could not load invitation:', invitationError);
    return new Response('Could not load the invitation.', { status: 500, headers: corsHeaders });
  }
  if (!invitation || invitation.inviter_id !== authData.user.id) {
    return new Response('Invitation not found or permission denied.', { status: 404, headers: corsHeaders });
  }
  if (invitation.status !== 'pending' || new Date(invitation.expires_at) <= new Date()) {
    return new Response('This invitation is no longer active.', { status: 409, headers: corsHeaders });
  }
  if (invitation.invitee_user_id) {
    return new Response(JSON.stringify({ delivered: false, inApp: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!resendApiKey || !sender || !appUrl) {
    return new Response('Set RESEND_API_KEY, INVITATION_FROM_EMAIL, and APP_PUBLIC_URL to send email invitations.', {
      status: 503,
      headers: corsHeaders,
    });
  }

  const trip = Array.isArray(invitation.trips) ? invitation.trips[0] : invitation.trips;
  const inviter = Array.isArray(invitation.inviter) ? invitation.inviter[0] : invitation.inviter;
  const inviteBase = new URL(appUrl);
  if (!inviteBase.pathname.endsWith('/')) inviteBase.pathname += '/';
  const inviteUrl = new URL(`?invitation=${encodeURIComponent(invitation.id)}`, inviteBase);
  const dates = trip?.start_date && trip?.end_date ? ` (${trip.start_date} – ${trip.end_date})` : '';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [invitation.email],
      subject: `${inviter?.display_name || 'A Trip member'} invited you to ${trip?.name || 'a trip'}`,
      text: `${inviter?.display_name || 'A Trip member'} invited you to join ${trip?.name || 'a trip'}${dates}.\n\nOpen Trip to accept or reject this invitation:\n${inviteUrl.href}`,
      html: `<p><strong>${escapeHtml(inviter?.display_name || 'A Trip member')}</strong> invited you to join <strong>${escapeHtml(trip?.name || 'a trip')}</strong>${escapeHtml(dates)}.</p><p><a href="${escapeHtml(inviteUrl.href)}">Open Trip to respond to the invitation</a></p>`,
    }),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Invitation email provider returned an error:', responseBody);
    return new Response('The email provider could not deliver this invitation.', { status: 502, headers: corsHeaders });
  }

  const { error: updateError } = await admin
    .from('trip_invitations')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', invitation.id);
  if (updateError) {
    console.error('Email was sent but the invitation delivery timestamp could not be saved:', updateError);
    return new Response('Email was sent, but delivery state could not be saved.', { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ delivered: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}
