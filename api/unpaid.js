import { createClient } from '@supabase/supabase-js';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';

// Vercel tidak punya font sistem: taruh Inter-Regular.ttf & Inter-Bold.ttf di /fonts
GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/Inter_18pt-Regular.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/Inter_18pt-Bold.ttf'), 'InterBold');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const rp = n => 'Rp' + n.toLocaleString('id-ID');

function render(title, rows) {
  const W = 1080, P = 48, ROW = 64, H = 250 + rows.length * ROW + 90;
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#EEF2F1'; x.fillRect(0, 0, W, H);

  x.fillStyle = '#14212B'; x.textAlign = 'left';
  x.font = '46px InterBold'; x.fillText(title, P, 92);
  x.fillStyle = '#5B6B76'; x.font = '26px Inter';
  x.fillText(`${rows.length} orang belum bayar, per ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, P, 136);

  x.fillStyle = '#0E5E6F'; x.fillRect(P - 16, 164, W - P * 2 + 32, 56);
  x.fillStyle = '#fff'; x.font = '24px InterBold';
  x.fillText('No', P, 200); x.fillText('Nama', P + 70, 200); x.fillText('Nunggak', 650, 200);
  x.textAlign = 'right'; x.fillText('Total', W - P, 200);

  rows.forEach((r, i) => {
    const y = 250 + i * ROW;
    if (i % 2) { x.fillStyle = '#E1E8E6'; x.fillRect(P - 16, y - 8, W - P * 2 + 32, ROW); }
    x.font = '28px Inter'; x.textAlign = 'left';
    x.fillStyle = '#5B6B76'; x.fillText(String(i + 1), P, y + 34);
    x.fillStyle = '#14212B'; x.fillText(r.name.slice(0, 26), P + 70, y + 34);
    x.fillStyle = r.count >= 3 ? '#B3382C' : '#B7791F'; x.fillText(`${r.count}x`, 650, y + 34);
    x.fillStyle = '#14212B'; x.textAlign = 'right'; x.fillText(rp(r.total), W - P, y + 34);
  });

  x.fillStyle = '#5B6B76'; x.font = '22px Inter'; x.textAlign = 'center';
  x.fillText('Yuk segera dilunasi, makasih!', W / 2, H - 36);
  return c.toBuffer('image/png');
}

export default async function handler(req, res) {
  const { group, period } = req.query;
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user } } = await sb.auth.getUser(token);
  const { data: g } = await sb.from('groups').select('name, owner_id').eq('id', group).single();
  if (!user || !g || g.owner_id !== user.id) return res.status(401).json({ message: 'Khusus bendahara' });

  let pq = sb.from('periods').select('id, amount').eq('group_id', group);
  if (period) pq = pq.eq('id', period);
  const [{ data: periods }, { data: members }, { data: payments }] = await Promise.all([
    pq,
    sb.from('members').select('id, name').eq('group_id', group).order('name'),
    sb.from('payments').select('period_id, member_id').eq('group_id', group),
  ]);

  const paid = new Set(payments.map(p => `${p.period_id}:${p.member_id}`));
  const rows = members
    .map(m => {
      const miss = periods.filter(p => !paid.has(`${p.id}:${m.id}`));
      return { name: m.name, count: miss.length, total: miss.reduce((s, p) => s + p.amount, 0) };
    })
    .filter(r => r.count)
    .sort((a, b) => b.total - a.total);

  if (!rows.length) return res.status(200).json({ message: 'Semua sudah lunas' });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', 'attachment; filename="tunggakan-kas.png"');
  res.send(render(`Tunggakan Kas ${g.name}`, rows));
}
