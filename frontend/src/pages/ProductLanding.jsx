import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, Banknote, Barcode, BookOpenCheck, Calculator, ChevronDown, CloudOff,
  DatabaseBackup, FileSpreadsheet, HandCoins, Landmark, Loader2, MessageCircle, MonitorSmartphone,
  PlayCircle, Printer, Receipt, RotateCcw, Search, ShieldCheck, Store, Tags, Truck, Users, Wallet,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { useAuth } from '../context/useAuth';

/**
 * صفحة تسويق النظام نفسه (نسخة العرض فقط، عند DJANGO_DEMO_MODE): لأصحاب
 * محلات قطع الغيار، لا لزبائن محل بعينه. متجر المحل التجريبي على /store.
 */

const WHATSAPP_NUMBER = '249902929451';
const WHATSAPP_DISPLAY = '0902929451';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  'السلام عليكم، أريد معرفة المزيد عن نظام اسبير لمحل قطع الغيار.',
)}`;
const shot = (name) => `${import.meta.env.BASE_URL}landing/${name}`;

const PROBLEMS = [
  {
    icon: BookOpenCheck,
    problem: 'الدفتر يضيع والحساب لا يطابق المخزون',
    solution: 'كل بيع بفاتورة، والرصيد يُخصم تلقائياً، ولكل قطعة سجل حركات: من باع ومتى وكم بقي.',
  },
  {
    icon: Landmark,
    problem: 'إشعار بنكك نفسه يُستخدم مرتين',
    solution: 'رقم الإشعار لا يُقبل مرتين في النظام كله، وشاشة لمطابقة التحويلات مع كشف البنك.',
  },
  {
    icon: HandCoins,
    problem: 'ديون الورش مبعثرة في الورق',
    solution: 'حد ائتمان لكل عميل، وكشف حساب جاهز للطباعة، وتحصيل نقدي أو بالتحويل.',
  },
  {
    icon: Calculator,
    problem: 'الدولار تغيّر وأسعارك قديمة',
    solution: 'سجّل سعر الصرف الجديد، وراجع الأسعار المقترحة قبل تطبيقها على القطع المستوردة.',
  },
  {
    icon: Search,
    problem: 'الزبون يقول «طرمبة» والصنف مسجّل «مضخة»',
    solution: 'بحث بالأسماء الدارجة والرقم الأصلي ورقم القطعة والباركود، بأي طريقة كتابة.',
  },
  {
    icon: Wallet,
    problem: 'الدرج ناقص ولا تعرف السبب',
    solution: 'إقفال يومي يقارن النقد المعدود بالمتوقع بعد المبيعات والمرتجعات والمصروفات.',
  },
];

const SHOWCASE = [
  {
    image: 'pos.webp',
    title: 'نقطة بيع سريعة',
    text: 'امسح الباركود أو ابحث بالاسم، والقطعة تدخل السلة مباشرة. الدفع نقداً أو تحويلاً أو مختلطاً أو آجلاً، ثم إيصال على طابعة حرارية.',
    points: ['قارئ باركود USB أو بلوتوث', 'إيصال 80 أو 58 مم أو A4', 'خصم تلقائي للورش وتجار الجملة'],
  },
  {
    image: 'statement.webp',
    title: 'العملاء والديون',
    text: 'ملف لكل عميل: الرصيد المستحق، والائتمان المتاح، وكشف حساب برصيد جارٍ، وسجل فواتيره.',
    points: ['البيع الآجل ضمن حد ائتمان', 'تسجيل دفعة نقداً أو تحويلاً', 'قائمة المدينين بنقرة'],
  },
  {
    image: 'daily-close.webp',
    title: 'إقفال اليومية',
    text: 'في نهاية اليوم: المبيعات والتحصيلات والمرتجعات والمصروفات، والنقد المتوقع في الدرج مقابل المعدود.',
    points: ['المصروفات اليومية', 'الفرق: عجز أو زيادة', 'ملخص مطبوع لكل يوم'],
  },
  {
    image: 'transfers.webp',
    title: 'مطابقة التحويلات',
    text: 'كل تحويل برقم إشعاره وحساب المرسل وصورة الإشعار. علّمه «مطابق» بعد مقارنته بكشف البنك.',
    points: ['رفض الإشعار المكرر', 'إجمالي كل حساب بنكي', 'تحويلات غير مطابقة ظاهرة'],
  },
  {
    image: 'dashboard.webp',
    title: 'لوحة صاحب المحل',
    text: 'إيرادات اليوم الصافية، والبيع الآجل، والتحصيلات، وتنبيهات المخزون المنخفض، وإجمالي ديون العملاء.',
    points: ['تقارير الأرباح بالفترة', 'أكثر القطع مبيعاً', 'صلاحيات للمدير والمشرف والكاشير'],
  },
];

const SUDAN_READY = [
  { icon: CloudOff, title: 'يعمل بلا إنترنت', text: 'على جهاز داخل المحل، والهواتف تتصل به عبر الواي فاي. انقطاع الإنترنت لا يوقف البيع.' },
  { icon: DatabaseBackup, title: 'نسخ احتياطي يومي', text: 'نسخة مشفّرة تلقائياً إلى Google Drive أو قرص خارجي، تُؤخذ والبيع مستمر.' },
  { icon: Users, title: 'أكثر من كاشير معاً', text: 'بيع متزامن من عدة أجهزة دون أن تُباع القطعة الأخيرة مرتين.' },
  { icon: MonitorSmartphone, title: 'عربي ويعمل على الجوال', text: 'واجهة عربية كاملة، تعمل على الكمبيوتر والتابلت والهاتف، وتُثبّت كتطبيق.' },
];

const MORE = [
  { icon: Barcode, text: 'جرد بقارئ الباركود أو كاميرا الهاتف' },
  { icon: Tags, text: 'طباعة ملصقات باركود للقطع' },
  { icon: FileSpreadsheet, text: 'إدخال الأصناف من ملف Excel' },
  { icon: RotateCcw, text: 'المرتجعات الجزئية والكاملة' },
  { icon: Truck, text: 'الموردون والتوريد بالدولار أو الدرهم' },
  { icon: Receipt, text: 'تقارير المبيعات والأرباح الصافية' },
  { icon: Store, text: 'متجر إلكتروني لطلبات الزبائن' },
  { icon: Printer, text: 'طباعة الفواتير وكشوف الحساب' },
  { icon: ShieldCheck, text: 'صلاحيات لكل موظف وسجل لكل حركة' },
];

const STEPS = [
  { title: 'نركّب النظام', text: 'على جهاز في محلك (لابتوب أو كمبيوتر عادي)، ونربط هواتف الطاقم والطابعة والقارئ.' },
  { title: 'ندخل أصنافك', text: 'من ملف Excel أو من الدفتر، بأسعارك وأرصدتك وأسمائها الدارجة.' },
  { title: 'ندرّبك وتبدأ البيع', text: 'تدريب لك ولطاقمك، ودعم عبر واتساب بعد التشغيل.' },
];

const FAQ = [
  {
    q: 'هل يحتاج النظام إلى إنترنت؟',
    a: 'لا. يعمل على شبكة المحل الداخلية. الإنترنت يُستخدم فقط إن أردت رفع النسخة الاحتياطية إلى السحابة.',
  },
  {
    q: 'ماذا يحدث عند انقطاع الكهرباء؟',
    a: 'كل بيع يُحفظ فور تسجيله ولا يضيع. ونوصي بجهاز UPS أو بطارية للجهاز والراوتر حتى يستمر البيع.',
  },
  {
    q: 'هل أحتاج أجهزة خاصة؟',
    a: 'جهاز كمبيوتر أو لابتوب عادي يكفي، والهواتف تتصل به. الطابعة الحرارية وقارئ الباركود اختياريان.',
  },
  {
    q: 'كيف أنقل أصنافي الحالية؟',
    a: 'من ملف Excel بقالب جاهز. يعرض النظام أخطاء كل صف قبل الحفظ، فلا يدخل شيء ناقص.',
  },
  {
    q: 'هل بياناتي آمنة؟',
    a: 'البيانات على جهاز داخل محلك، والنسخ الاحتياطية مشفّرة، ولكل موظف صلاحياته: الكاشير لا يرى التكلفة ولا يعدّل الأرصدة.',
  },
  {
    q: 'كم السعر؟',
    a: 'يعتمد على حجم المحل وعدد الأجهزة. تواصل معنا عبر واتساب ونرسل لك عرضاً.',
  },
];

function WhatsAppButton({ className = '', children = 'تواصل عبر واتساب' }) {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-success-600 hover:bg-success-500
        text-white font-bold transition shadow-lg shadow-success-600/20 ${className}`}
    >
      <MessageCircle className="w-5 h-5" aria-hidden="true" />
      {children}
    </a>
  );
}

function IconOf({ icon, className }) {
  const Glyph = icon;
  return <Glyph className={className} aria-hidden="true" />;
}

function DemoButton({ onClick, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl gradient-primary text-white font-bold
        hover:opacity-95 transition shadow-lg shadow-primary-600/30 disabled:opacity-60 cursor-pointer"
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <PlayCircle className="w-5 h-5" aria-hidden="true" />}
      جرّب النظام الآن
    </button>
  );
}

function Frame({ src, alt, className = '', eager = false }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-surface-900 shadow-2xl shadow-black/40 overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 bg-surface-950/60" aria-hidden="true">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
      </div>
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} className="w-full h-auto block" />
    </div>
  );
}

export default function ProductLanding({ demoAccounts = [] }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [entering, setEntering] = useState(false);
  const manager = demoAccounts.find((account) => account.role === 'مدير') || demoAccounts[0];

  // دخول مباشر بحساب المدير التجريبي؛ إن تعذّر تبقى صفحة الدخول بأزرارها.
  const tryDemo = async () => {
    if (!manager) {
      navigate('/login');
      return;
    }
    setEntering(true);
    try {
      await login(manager.username, manager.password);
      navigate('/dashboard');
    } catch {
      navigate('/login');
    } finally {
      setEntering(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface-950 text-surface-200 font-sans">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-30 bg-surface-950/85 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5">
            <BrandMark className="w-9 h-9 rounded-xl" />
            <span className="text-xl font-extrabold text-white">اسبير</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-surface-300" aria-label="أقسام الصفحة">
            <a href="#features" className="hover:text-white">المزايا</a>
            <a href="#sudan" className="hover:text-white">لماذا اسبير</a>
            <a href="#how" className="hover:text-white">كيف نبدأ</a>
            <a href="#faq" className="hover:text-white">أسئلة شائعة</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm text-surface-300 hover:text-white">
              دخول
            </Link>
            <button
              type="button"
              onClick={tryDemo}
              disabled={entering}
              className="px-4 py-2 rounded-xl gradient-primary text-white text-sm font-bold disabled:opacity-60 cursor-pointer"
            >
              جرّب الآن
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* البطل */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute -top-40 right-0 w-[36rem] h-[36rem] rounded-full bg-primary-600/10 blur-[140px]" />
            <div className="absolute top-60 -left-40 w-[28rem] h-[28rem] rounded-full bg-accent-500/10 blur-[120px]" />
          </div>
          <div className="relative max-w-6xl mx-auto px-4 pt-14 pb-20 md:pt-20 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
            <div className="space-y-6 text-center lg:text-right">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-600/15 border border-primary-500/25 text-primary-200 text-xs font-semibold">
                <BadgeCheck className="w-4 h-4" aria-hidden="true" />
                لمحلات قطع غيار السيارات في السودان
              </span>
              <h1 className="text-[2rem] md:text-5xl lg:text-[2.75rem] font-extrabold text-white leading-[1.35]">
                نقطة بيع لمحل قطع الغيار
                <span className="block text-primary-300">تعمل حتى بدون إنترنت</span>
              </h1>
              <p className="text-lg text-surface-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
                اسبير نظام نقطة بيع ومخزون مصمم لمحل قطع الغيار: بحث بالأسماء الدارجة، تحويلات بنكك بلا تكرار،
                آجل للورش بحد ائتمان، وإقفال يومي للدرج.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <DemoButton onClick={tryDemo} busy={entering} />
                <WhatsAppButton />
              </div>
              <p className="text-xs text-surface-500">النسخة التجريبية ببيانات وهمية، بلا تسجيل، وتُعاد كل ليلة.</p>
            </div>
            <div className="relative">
              <img
                src={shot('pos-mobile.webp')}
                alt="نقطة البيع على الهاتف: سلة مبيعات وطريقة الدفع"
                className="sm:hidden mx-auto w-60 rounded-[1.75rem] border-4 border-surface-800 shadow-2xl shadow-black/60"
              />
              <Frame
                src={shot('pos.webp')}
                alt="شاشة نقطة البيع في اسبير: سلة مبيعات ونتائج بحث عن طرمبة"
                className="hidden sm:block"
                eager
              />
              <img
                src={shot('pos-mobile.webp')}
                alt="نقطة البيع على الهاتف"
                loading="lazy"
                className="hidden sm:block absolute -bottom-10 -left-4 w-40 md:w-48 rounded-[1.75rem] border-4 border-surface-800 shadow-2xl shadow-black/60"
              />
            </div>
          </div>
        </section>

        {/* المشاكل والحلول */}
        <section className="max-w-6xl mx-auto px-4 py-16" aria-labelledby="problems-title">
          <h2 id="problems-title" className="text-3xl font-extrabold text-white text-center">مشاكل يعرفها كل صاحب محل</h2>
          <p className="text-center text-surface-400 mt-3">وكيف يحلّها اسبير</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PROBLEMS.map(({ icon, problem, solution }) => (
              <article key={problem} className="glass-card p-6 space-y-3">
                <div className="w-11 h-11 rounded-xl bg-primary-600/15 flex items-center justify-center">
                  <IconOf icon={icon} className="w-5 h-5 text-primary-300" />
                </div>
                <h3 className="font-bold text-white">{problem}</h3>
                <p className="text-sm text-surface-400 leading-relaxed">{solution}</p>
              </article>
            ))}
          </div>
        </section>

        {/* عرض الشاشات */}
        <section id="features" className="max-w-6xl mx-auto px-4 py-16 space-y-24" aria-label="المزايا">
          {SHOWCASE.map((item, index) => (
            <div key={item.title} className="grid lg:grid-cols-2 gap-10 items-center">
              <div className={`space-y-4 ${index % 2 ? 'lg:order-2' : ''}`}>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white">{item.title}</h2>
                <p className="text-surface-300 leading-relaxed">{item.text}</p>
                <ul className="space-y-2">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-surface-300">
                      <BadgeCheck className="w-4 h-4 text-primary-400 shrink-0" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <Frame src={shot(item.image)} alt={`شاشة ${item.title} في اسبير`} />
            </div>
          ))}
        </section>

        {/* مصمم للسودان */}
        <section id="sudan" className="bg-surface-900/50 border-y border-white/5" aria-labelledby="sudan-title">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <h2 id="sudan-title" className="text-3xl font-extrabold text-white text-center">مصمم لظروف السوق هنا</h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {SUDAN_READY.map(({ icon, title, text }) => (
                <div key={title} className="p-6 rounded-2xl bg-surface-950/60 border border-white/5 space-y-3">
                  <IconOf icon={icon} className="w-7 h-7 text-primary-300" />
                  <h3 className="font-bold text-white">{title}</h3>
                  <p className="text-sm text-surface-400 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-12">
              <h3 className="text-lg font-bold text-white text-center">وأيضاً</h3>
              <ul className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {MORE.map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-3 p-3 rounded-xl bg-surface-950/40 border border-white/5 text-sm text-surface-300">
                    <IconOf icon={icon} className="w-4 h-4 text-primary-400 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* كيف نبدأ */}
        <section id="how" className="max-w-6xl mx-auto px-4 py-16" aria-labelledby="how-title">
          <h2 id="how-title" className="text-3xl font-extrabold text-white text-center">كيف نبدأ</h2>
          <ol className="mt-10 grid md:grid-cols-3 gap-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="glass-card p-6 space-y-3">
                <span className="w-10 h-10 rounded-full gradient-primary text-white font-extrabold flex items-center justify-center">
                  {index + 1}
                </span>
                <h3 className="font-bold text-white">{step.title}</h3>
                <p className="text-sm text-surface-400 leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 glass-card p-8 text-center space-y-4">
            <Banknote className="w-8 h-8 text-primary-300 mx-auto" aria-hidden="true" />
            <h3 className="text-xl font-extrabold text-white">السعر حسب حجم محلك</h3>
            <p className="text-surface-400">عدد الأجهزة والفروع يحدد العرض. تواصل معنا ونرسل لك عرضاً واضحاً.</p>
            <WhatsAppButton>اطلب عرض سعر</WhatsAppButton>
          </div>
        </section>

        {/* أسئلة شائعة */}
        <section id="faq" className="max-w-3xl mx-auto px-4 py-16" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-3xl font-extrabold text-white text-center">أسئلة شائعة</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group glass-card px-5 py-4">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-bold text-white">
                  {q}
                  <ChevronDown className="w-5 h-5 text-surface-400 transition group-open:rotate-180 shrink-0" aria-hidden="true" />
                </summary>
                <p className="mt-3 text-sm text-surface-400 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* الدعوة الأخيرة */}
        <section className="max-w-6xl mx-auto px-4 pb-20">
          <div className="rounded-3xl p-10 md:p-14 text-center bg-gradient-to-br from-primary-700/40 to-surface-900 border border-primary-500/20 space-y-5">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">جرّبه بنفسك قبل أن تقرر</h2>
            <p className="text-surface-300 max-w-xl mx-auto">
              ادخل النسخة التجريبية كمدير، بِع، سجّل ديناً، وأقفل اليومية. ثم كلّمنا لنركّبه في محلك.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <DemoButton onClick={tryDemo} busy={entering} />
              <WhatsAppButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-surface-500">
          <div className="flex items-center gap-2">
            <BrandMark className="w-7 h-7 rounded-lg" />
            <span className="text-surface-300 font-bold">اسبير</span>
            <span>— نظام نقطة بيع قطع غيار السيارات</span>
          </div>
          <div className="flex items-center gap-5">
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="hover:text-white" dir="ltr">
              واتساب {WHATSAPP_DISPLAY}
            </a>
            <Link to="/store" className="hover:text-white inline-flex items-center gap-1">
              متجر المحل التجريبي <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
