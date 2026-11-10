// POST /functions/v1/delete-account — deletes the caller's auth user. All their rows are
// removed by `on delete cascade` foreign keys to auth.users.
import { HttpError, adminClient, handle, json, requireUser } from '../_shared/http.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    const user = await requireUser(req);
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw new HttpError(500, 'Could not delete account');
    return json({ deleted: true });
  }),
);
