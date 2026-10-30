import { Platform } from 'react-native';
import { CONDITIONS, addressLine, ar, money, orderNo, warrantyLabel, type Order, type Profile, type Quote, type Request, type Shop, type ShopPrivate } from './data';
import { PAY_NAME, PAY_STATUS } from './payments';
import { supabase } from './supabase';

// the brand mark (white gear) on its navy tile
const MARK_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 100 100\"> <defs> <polygon id=\"tooth\" points=\"39.3,8 48.7,8 50.8,19 37.2,19\"/> <g id=\"hand\" transform=\"translate(46 47.5) scale(.95) translate(-47.5 -42)\"> <rect x=\"43\" y=\"40\" width=\"9\" height=\"36\" rx=\"4.5\"/> <rect x=\"51\" y=\"57\" width=\"8.5\" height=\"18\" rx=\"4.25\"/> <rect x=\"58.5\" y=\"60\" width=\"8\" height=\"16\" rx=\"4\"/> <rect x=\"65.5\" y=\"63.5\" width=\"7\" height=\"13\" rx=\"3.5\"/> <path d=\"M43 68 L72.5 70 L72 80 C71.5 89 64 95 55 95 C48 95 43.5 92 39.5 87 L30.5 77.5 C28 74.5 31.5 70.5 35 72.5 L43 77 Z\"/> </g> <g id=\"lines\" transform=\"translate(4 1)\"> <path d=\"M70 31 H92 Q95 31 93.6 33.8 L92.4 36.2 Q91 39 88 39 H66 Z\"/> <path d=\"M71 44 H92 Q95 44 93.6 46.8 L92.4 49.2 Q91 52 88 52 H68 Z\"/> <path d=\"M69 57 H88 Q91 57 89.6 59.8 L88.4 62.2 Q87 65 84 65 H65 Z\"/> </g> </defs> <g fill=\"#FFFFFF\"> <circle cx=\"44\" cy=\"50\" r=\"33\"/> <use xlink:href=\"#tooth\"/><use xlink:href=\"#tooth\" transform=\"rotate(45 44 50)\"/><use xlink:href=\"#tooth\" transform=\"rotate(135 44 50)\"/><use xlink:href=\"#tooth\" transform=\"rotate(180 44 50)\"/><use xlink:href=\"#tooth\" transform=\"rotate(225 44 50)\"/><use xlink:href=\"#tooth\" transform=\"rotate(270 44 50)\"/><use xlink:href=\"#tooth\" transform=\"rotate(315 44 50)\"/> </g> <circle cx=\"44\" cy=\"50\" r=\"24.5\" fill=\"#041D3F\"/> <use xlink:href=\"#lines\" fill=\"#041D3F\" stroke=\"#041D3F\" stroke-width=\"3\" stroke-linejoin=\"round\"/> <use xlink:href=\"#lines\" fill=\"#0AABFE\"/> <circle cx=\"45\" cy=\"50\" r=\"18.5\" fill=\"#041D3F\" stroke=\"#0AABFE\" stroke-width=\"5.5\"/> <g stroke=\"#7CD035\" stroke-width=\"2.8\" stroke-linecap=\"round\"> <line x1=\"46\" y1=\"37\" x2=\"46\" y2=\"41.5\"/><line x1=\"38.6\" y1=\"40\" x2=\"41.4\" y2=\"42.8\"/><line x1=\"53.4\" y1=\"40\" x2=\"50.6\" y2=\"42.8\"/> </g> <use xlink:href=\"#hand\" fill=\"none\" stroke=\"#041D3F\" stroke-width=\"5.26\" stroke-linejoin=\"round\"/> <use xlink:href=\"#hand\" fill=\"#FFFFFF\"/> </svg>";
/** The mark as a PNG (html2canvas draws bitmaps more reliably than SVG). */
async function markPng(): Promise<string> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MARK_SVG);
  await new Promise((ok) => { img.onload = ok; img.onerror = ok; });
  const c = document.createElement('canvas'); c.width = 184; c.height = 184;
  c.getContext('2d')?.drawImage(img, 0, 0, 184, 184);
  return c.toDataURL('image/png');
}
const markTile = (src: string) => `<div style="width:52px;height:52px;border-radius:14px;background:#041D3F;display:flex;align-items:center;justify-content:center"><img width="46" height="46" src="${src}"/></div>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const day = (iso: string) => ar(new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '، '));

/** The receipt as a printable A4 page (HTML), right to left. */
function receiptHtml(mark: string, o: Order, parts: Request[], quotes: Quote[], shop: Shop | null, priv: ShopPrivate | null, customer: Profile | null) {
  const quoteOf = (p: Request) => quotes.find((q) => q.id === p.chosen_quote_id);
  const rows = parts.map((p, i) => {
    const q = quoteOf(p); const qty = p.qty || 1; const price = q?.price ?? 0;
    return `<tr><td>${ar(i + 1)}</td><td><b>${esc(p.part)}</b>${q?.brand ? ` (${esc(q.brand)})` : ''}<div class="m">${esc(p.car_make)} ${esc(p.car_model)} ${ar(p.car_year)}${q ? '، ' + CONDITIONS[q.condition] + '، ' + warrantyLabel(q.warranty_days) : ''}</div></td>
      <td class="n">${ar(qty)}</td><td class="n">${money(price)}</td><td class="n">${money(price * qty)}</td></tr>`;
  }).join('');
  const items = Number(o.items_total); const fee = Number(o.delivery_fee || 0);
  const shopName = priv?.name || (shop ? 'محل في ' + shop.area : 'المحل');
  return `
  <div class="r">
    <div class="top">
      <div class="brand">${markTile(mark)}<div><div class="w">ضغطة</div><div class="m">قطع غيار العربيات، بضغطة</div></div></div>
      <div class="ttl"><div class="h">إيصال أوردر</div><div class="no">${orderNo(o.order_no)}</div><div class="m">${day(o.created_at)}</div></div>
    </div>
    <div class="cols">
      <div class="box"><div class="lbl">من المحل</div><b>${esc(shopName)}</b>
        <div class="m">${esc(ar([priv?.street, priv?.building && 'رقم ' + priv.building, shop?.area, shop?.governorate].filter(Boolean).join('، ')))}</div>
        ${priv?.phone ? `<div class="m ltr">${esc(priv.phone)}</div>` : ''}</div>
      <div class="box"><div class="lbl">للعميل</div><b>${esc(customer?.full_name || 'العميل')}</b>
        <div class="m">${customer ? esc(ar(addressLine(customer))) : ''}</div>
        ${customer?.phone ? `<div class="m ltr">${esc(customer.phone)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th>#</th><th>القطعة</th><th class="n">العدد</th><th class="n">السعر</th><th class="n">الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sum">
      <div class="info">
        <div><span>التسليم</span><b>${o.delivery_mode === 'pickup' ? 'استلام من المحل' : 'توصيل للعنوان'}</b></div>
        <div><span>طريقة الدفع</span><b>${PAY_NAME[o.payment_method] ?? '—'}</b></div>
        <div><span>حالة الدفع</span><b>${PAY_STATUS[o.payment_status]?.label ?? '—'}</b></div>
        ${o.payment_ref ? `<div><span>رقم العملية</span><b class="ltr">${esc(o.payment_ref)}</b></div>` : ''}
      </div>
      <div class="tot">
        <div><span>القطع</span><b>${money(items)} ج.م</b></div>
        <div><span>التوصيل</span><b>${fee ? money(fee) + ' ج.م' : 'مجاناً'}</b></div>
        <div class="g"><span>الإجمالي</span><b>${money(items + fee)} ج.م</b></div>
      </div>
    </div>
    <div class="note">افحص القطعة وانت بتستلم. لو مش زي الوصف ترفضها أو تبلّغنا من التطبيق. الضمان (لو موجود) بيبدأ من يوم الاستلام، والإيصال ده إثبات الشراء.</div>
    <div class="foot"><span>ضغطة، سوق قطع غيار العربيات في مصر</span><span>اتعمل ${day(new Date().toISOString())}</span></div>
  </div>`;
}

const CSS = `
.r{width:794px;min-height:1123px;box-sizing:border-box;padding:56px 56px 40px;background:#fff;color:#041D3F;direction:rtl;
  font-family:"Times New Roman","NotoNaskhArabic_400Regular","Noto Naskh Arabic",serif;font-size:15px;line-height:1.6;position:relative}
.r b{font-family:"Times New Roman","NotoNaskhArabic_700Bold","Noto Naskh Arabic",serif;font-weight:700}
.r .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #041D3F;padding-bottom:18px}
.r .brand{display:flex;gap:12px;align-items:center}.r .w{font-family:Alexandria_900Black,Alexandria,sans-serif;font-size:30px;line-height:1.2}
.r .ttl{text-align:left}.r .h{font-size:22px;font-weight:700}.r .no{font-size:28px;font-weight:700;color:#0077D6}
.r .m{color:#5B6B80;font-size:13px}.r .ltr{direction:ltr;text-align:right}
.r .cols{display:flex;gap:16px;margin:24px 0}.r .box{flex:1;border:1px solid #E3E9F1;border-radius:12px;padding:14px 16px}
.r .lbl{font-size:12px;color:#0077D6;font-weight:700;margin-bottom:2px}
.r table{width:100%;border-collapse:collapse}.r th{background:#041D3F;color:#fff;font-weight:700;padding:10px 12px;text-align:right;font-size:13px}
.r th:first-child{border-radius:0 8px 8px 0}.r th:last-child{border-radius:8px 0 0 8px}
.r td{padding:12px;border-bottom:1px solid #E3E9F1;vertical-align:top}.r .n{text-align:left;white-space:nowrap}
.r .sum{display:flex;gap:24px;margin-top:22px}.r .info,.r .tot{flex:1}
.r .info div,.r .tot div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #E3E9F1}
.r .info span,.r .tot span{color:#5B6B80}.r .tot .g{border:0;background:#041D3F;color:#fff;border-radius:10px;padding:12px 14px;margin-top:8px;font-size:18px}
.r .tot .g span{color:#fff}
.r .note{margin-top:28px;background:#F4F7FB;border-radius:10px;padding:12px 14px;font-size:13px;color:#2A3B52}
.r .foot{position:absolute;bottom:32px;left:56px;right:56px;display:flex;justify-content:space-between;font-size:12px;color:#8A97A8;border-top:1px solid #E3E9F1;padding-top:10px}
`;

/** Builds the order's receipt and downloads it as a PDF. Returns an error message, or null when done. */
export async function downloadReceipt(orderId: string): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 'الإيصال بيتحمّل من نسخة الموقع دلوقتي.';
  const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return 'مش لاقيين الأوردر.';
  const order = o as Order;
  const parts = ((await supabase.from('requests').select('*').eq('order_id', orderId).order('num')).data ?? []) as Request[];
  const qids = parts.map((p) => p.chosen_quote_id).filter(Boolean) as string[];
  const [quotes, shop, priv, customer] = await Promise.all([
    qids.length ? supabase.from('quotes').select('*').in('id', qids) : Promise.resolve({ data: [] }),
    supabase.from('shops').select('*').eq('id', order.shop_id).maybeSingle(),
    supabase.from('shop_private').select('*').eq('id', order.shop_id).maybeSingle(),
    supabase.from('profiles').select('*').eq('id', order.customer_id).maybeSingle(),
  ]);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1';
  host.innerHTML = `<style>${CSS}</style>` + receiptHtml(await markPng(), order, parts, (quotes.data ?? []) as Quote[], shop.data as Shop | null, priv.data as ShopPrivate | null, customer.data as Profile | null);
  document.body.appendChild(host);
  try {
    await (document as any).fonts?.ready;
    await Promise.all(Array.from(host.querySelectorAll('img')).map((im) => (im.complete ? Promise.resolve() : new Promise((ok) => { im.onload = ok; im.onerror = ok; }))));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const page = host.querySelector('.r') as HTMLElement;
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const w = pdf.internal.pageSize.getWidth(); const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    pdf.setProperties({ title: `Daghta receipt ${order.order_no}` });
    pdf.save(`daghta-receipt-${order.order_no}.pdf`);
    return null;
  } catch {
    return 'حصلت مشكلة وإحنا بنعمل الإيصال، جرّب تاني.';
  } finally {
    host.remove();
  }
}
