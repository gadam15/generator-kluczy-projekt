import React, { useEffect, useMemo, useState } from "react";

const PRODUCTS = [
  { id: "g1", name: "Stardew Valley", category: "Indie · Symulacja", price: 39.99, emoji: "🌱", color: "#d8f3dc" },
  { id: "g2", name: "Hollow Knight", category: "Przygodowa · Akcja", price: 29.99, emoji: "🗡️", color: "#dbeafe" },
  { id: "g3", name: "Terraria", category: "Sandbox · Przygodowa", price: 34.99, emoji: "⛏️", color: "#fef3c7" },
  { id: "g4", name: "Celeste", category: "Platformowa · Indie", price: 24.99, emoji: "🏔️", color: "#fce7f3" },
  { id: "g5", name: "Portal 2", category: "Logiczna · Przygodowa", price: 19.99, emoji: "🌀", color: "#ede9fe" },
];
const money = n => `${n.toFixed(2).replace(".", ",")} zł`;
const get = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [users, setUsers] = useState(() => get("pixelkeys_users", []));
  const [user, setUser] = useState(() => get("pixelkeys_session", null));
  const [cart, setCart] = useState(() => get("pixelkeys_cart", []));
  const [authMode, setAuthMode] = useState("login");
  const [authOpen, setAuthOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => localStorage.setItem("pixelkeys_users", JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem("pixelkeys_session", JSON.stringify(user)), [user]);
  useEffect(() => localStorage.setItem("pixelkeys_cart", JSON.stringify(cart)), [cart]);

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  function add(product) {
    setCart(old => {
      const found = old.find(item => item.id === product.id);
      return found ? old.map(item => item.id === product.id ? { ...item, quantity: Math.min(10, item.quantity + 1) } : item) : [...old, { ...product, quantity: 1 }];
    });
    setNotice(`Dodano „${product.name}” do koszyka.`);
  }
  function changeQty(id, delta) {
    setCart(old => old.map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0 && item.quantity <= 10));
  }
  async function submitAuth(e) {
    e.preventDefault(); setNotice("");
    const email = form.email.trim().toLowerCase();
    if (!email.includes("@") || form.password.length < 6) return setNotice("Podaj poprawny e-mail i hasło (min. 6 znaków).");
    if (authMode === "register") {
      if (!form.name.trim()) return setNotice("Podaj nazwę użytkownika.");
      if (users.some(u => u.email === email)) return setNotice("Konto z tym e-mailem już istnieje.");
      const account = { name: form.name.trim(), email, passwordHash: await hashPassword(form.password) };
      setUsers(old => [...old, account]); setUser({ name: account.name, email });
      setNotice("Konto utworzone. Witaj w PixelKeys!"); setAuthOpen(false);
    } else {
      const account = users.find(u => u.email === email);
      if (!account || account.passwordHash !== await hashPassword(form.password)) return setNotice("Nieprawidłowy e-mail lub hasło.");
      setUser({ name: account.name, email: account.email }); setNotice(`Witaj ponownie, ${account.name}!`); setAuthOpen(false);
    }
    setForm({ name: "", email: "", password: "" });
  }
  async function checkout() {
    if (!user) { setAuthMode("login"); setAuthOpen(true); setNotice("Zaloguj się, aby wysłać zamówienie."); return; }
    if (!cart.length || busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("http://localhost:3001/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, items: cart.map(i => ({ productId: i.id, productName: i.name, quantity: i.quantity })) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się wysłać zamówienia.");
      setNotice(`Zamówienie ${data.orderId.slice(0, 8)} wysłano do RabbitMQ. To demonstracja — nie pobrano płatności.`);
      setCart([]);
    } catch (err) { setNotice(`${err.message} Upewnij się, że działa backend i RabbitMQ.`); }
    finally { setBusy(false); }
  }

  return <div className="app">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">P</span><span>pixel<span className="accent">keys</span><small>KLUCZE DO GIER</small></span></a>
      <nav><a href="#sklep">Sklep</a><a href="#koszyk">Koszyk <span className="count">{count}</span></a></nav>
      <div className="account">{user ? <><span className="welcome">Cześć, {user.name}</span><button className="outline small" onClick={() => {setUser(null);setNotice("Wylogowano.");}}>Wyloguj</button></> : <button className="outline" onClick={() => {setAuthMode("login");setAuthOpen(v => !v);}}>Zaloguj się</button>}</div>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow"><span className="dot"></span> TWOJE NASTĘPNE ODKRYCIE</span><h1>Dobre gry.<br/><span>Małe ceny.</span></h1><p>Wybierz coś dla siebie i dodaj do koszyka. Prosty sklep demonstracyjny stworzony z myślą o graczach.</p><a className="primary hero-button" href="#sklep">Zobacz gry <span>↘</span></a></div>
        <div className="hero-art"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="hero-disc">🎮</div><span className="float-tag tag-top">LEVEL UP!</span><span className="float-tag tag-bottom">PRESS START ↗</span><span className="spark spark-one">✳</span><span className="spark spark-two">✦</span></div>
        <div className="hero-bottom"><span>01 — WYBIERZ GRĘ</span><span>02 — DODAJ DO KOSZYKA</span><span>03 — GOTOWE DO ZABAWY</span></div>
      </section>
      <section id="sklep" className="shop-section"><div className="section-heading"><div><span className="eyebrow muted">MAŁA KOLEKCJA, DUŻO ZABAWY</span><h2>Wybierz swoją grę<span className="accent">.</span></h2></div><span className="product-count">05 PRODUKTÓW</span></div>
        <div className="products">{PRODUCTS.map((p, i) => <article className="product" key={p.id}><div className="product-art" style={{background:p.color}}><span className="product-number">0{i+1}</span><span className="product-emoji">{p.emoji}</span><span className="platform">PC · DIGITAL</span></div><div className="product-info"><span className="category">{p.category}</span><h3>{p.name}</h3><div className="product-bottom"><strong>{money(p.price)}</strong><button className="add-button" onClick={() => add(p)} aria-label={`Dodaj ${p.name} do koszyka`}>+</button></div></div></article>)}</div>
      </section>
      <section id="koszyk" className="cart-section"><div className="cart-heading"><div><span className="eyebrow muted">TWOJE WYBORY</span><h2>Koszyk<span className="accent">.</span></h2></div><span className="product-count">{count} SZT.</span></div>
        {cart.length === 0 ? <div className="empty-cart"><span className="empty-icon">＋</span><div><strong>Twój koszyk czeka na przygodę</strong><p>Dodaj grę z kolekcji powyżej, a pojawi się tutaj.</p></div><a href="#sklep" className="text-link">Przeglądaj gry ↗</a></div> :
          <div className="cart-content"><div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><span className="cart-emoji">{item.emoji}</span><div className="cart-item-name"><strong>{item.name}</strong><small>{money(item.price)} / szt.</small></div><div className="qty"><button onClick={() => changeQty(item.id,-1)} aria-label="Zmniejsz ilość">−</button><span>{item.quantity}</span><button onClick={() => changeQty(item.id,1)} aria-label="Zwiększ ilość">+</button></div><strong className="line-total">{money(item.price*item.quantity)}</strong><button className="remove" onClick={() => setCart(old => old.filter(i => i.id !== item.id))} aria-label="Usuń produkt">×</button></div>)}</div>
          <aside className="checkout"><span>RAZEM</span><strong>{money(total)}</strong><p>Wysyłka cyfrowa · bez opłat dodatkowych</p><button className="primary checkout-button" disabled={busy} onClick={checkout}>{busy ? "Wysyłanie..." : "Zamów i wyślij do RabbitMQ ↗"}</button><small>Demo edukacyjne — brak prawdziwej płatności.</small></aside></div>}
      </section>
      {authOpen && <section className="auth-panel"><div className="auth-heading"><div><span className="eyebrow muted">STREFA GRACZA</span><h2>{authMode === "login" ? "Miło Cię widzieć." : "Dołącz do nas."}</h2></div><button className="remove close" onClick={() => setAuthOpen(false)}>×</button></div><div className="auth-tabs"><button className={authMode==="login"?"active":""} onClick={() => setAuthMode("login")}>Logowanie</button><button className={authMode==="register"?"active":""} onClick={() => setAuthMode("register")}>Utwórz konto</button></div><form onSubmit={submitAuth}>{authMode==="register" && <label>Nazwa użytkownika<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Jak mamy Cię nazywać?" required /></label>}<label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="ty@przyklad.pl" required /></label><label>Hasło<input type="password" minLength="6" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimum 6 znaków" required /></label><button className="primary auth-submit" type="submit">{authMode==="login"?"Zaloguj się ↗":"Utwórz konto ↗"}</button></form><p className="auth-note">Dane konta są zapisywane lokalnie w tej przeglądarce. To wyłącznie wersja demonstracyjna.</p></section>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}
    </main>
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark">P</span><span>pixel<span className="accent">keys</span><small>KLUCZE DO GIER</small></span></a><span>MAŁY SKLEP. WIELKIE PRZYGODY.</span><span>© 2026 PIXELKEYS · PROJEKT EDUKACYJNY</span></footer>
  </div>;
}
