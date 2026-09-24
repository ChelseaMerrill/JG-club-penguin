class Component extends DCLogic {
  FLAV = [['#00BDFF','BLUE RASPBERRY'],['#F4F4F4','COCONUT'],['#BFE3F0','MINT'],['#0C4B5F','BLACKBERRY']];
  NAMES = ['Elena','Marcus','Dev','Priya','Sam','Kai','Rosa','Theo','Ines','Bo'];
  CAPS = ['#00BDFF','#F4F4F4','#0C4B5F','#BFE3F0'];
  BODIES = ['#161719','#0C4B5F','#3a4046'];
  state = { phase: 'trigger', wallet: 1250, tokens: 0, served: 0, lost: 0, streak: 0, best: 0, time: 120, paused: false, line: [], yours: [], toast: null, toastBg: '#00BDFF', josh: 'Double blue, coming up.', shakeKey: 0 };
  newCustomer(hard) {
    const n = Math.min(4, 1 + Math.floor(Math.random() * (hard ? 4 : 3)));
    const order = Array.from({ length: n }, () => Math.floor(Math.random() * 4));
    return { id: Math.random(), name: this.NAMES[Math.floor(Math.random() * this.NAMES.length)], cap: this.CAPS[Math.floor(Math.random() * 4)], body: this.BODIES[Math.floor(Math.random() * 3)], order, patience: 100, rate: (hard ? 1.6 : 1.1) + Math.random() * 0.6 };
  }
  start = () => { clearInterval(this.t); this.setState({ phase: 'play', tokens: 0, served: 0, lost: 0, streak: 0, best: 0, time: 120, paused: false, yours: [], toast: null, line: [this.newCustomer(), this.newCustomer(), this.newCustomer()], josh: 'Double blue, coming up.' }); this.t = setInterval(this.tick, 100); this.focus(); };
  focus() { setTimeout(() => { const el = document.querySelector('[data-screen-label="SNOW CONE STAND · PLAYABLE"]'); el && el.focus(); }, 50); }
  tick = () => { const s = this.state; if (s.phase !== 'play' || s.paused) return;
    const time = Math.max(0, s.time - 0.1); const rush = time <= 60 && time > 30;
    let line = s.line.map((c, i) => ({ ...c, patience: c.patience - (i === 0 ? c.rate * (rush ? 1.4 : 1) : 0.25) }));
    let lost = s.lost, streak = s.streak, toast = s.toast, josh = s.josh;
    if (line[0] && line[0].patience <= 0) { line.shift(); lost++; streak = 0; toast = 'WADDLED OFF'; josh = 'Too slow. They went to the Hexle stand.'; this.toastTimer(); }
    while (line.length < 3) line.push(this.newCustomer(rush));
    if (time <= 0) { clearInterval(this.t); this.setState({ phase: 'done', time: 0, line, lost, streak }); return; }
    this.setState({ time, line, lost, streak, toast, toastBg: toast === 'WADDLED OFF' ? '#F4F4F4' : s.toastBg, josh });
  };
  toastTimer() { clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: null }), 900); }
  add(i) { if (this.state.phase !== 'play' || this.state.paused || this.state.yours.length >= 4) return; this.setState(s => ({ yours: [...s.yours, i] })); }
  undo = () => this.setState(s => ({ yours: s.yours.slice(0, -1) }));
  serve = () => { const s = this.state; if (s.phase !== 'play' || s.paused || !s.line[0]) return;
    const c = s.line[0]; const ok = c.order.length === s.yours.length && c.order.every((v, i) => v === s.yours[i]);
    const rush = s.time <= 60 && s.time > 30; const pay = [0, 5, 10, 15, 25][c.order.length] * (rush ? 2 : 1);
    const line = s.line.slice(1);
    if (ok) { const streak = s.streak + 1; this.setState({ line, yours: [], tokens: s.tokens + pay, wallet: s.wallet + pay, served: s.served + 1, streak, best: Math.max(s.best, streak), toast: '+' + pay + (rush ? ' RUSH' : ''), toastBg: '#00BDFF', josh: ['Nice.', 'That is a cone.', 'Brain freeze incoming.', 'Faster. Faster.'][streak % 4] }); }
    else { this.setState({ line, yours: [], lost: s.lost + 1, streak: 0, toast: 'WRONG ORDER', toastBg: '#F4F4F4', josh: 'That was not what they asked for.' }); }
    this.toastTimer(); };
  onKey = (e) => { const k = e.key; if (['1','2','3','4'].includes(k)) { e.preventDefault(); this.add(+k - 1); } else if (k === ' ') { e.preventDefault(); this.serve(); } else if (k === 'Backspace') { e.preventDefault(); this.undo(); } else if (k === 'p' || k === 'P') this.togglePause(); };
  togglePause = () => this.setState(s => ({ paused: !s.paused }));
  quit = () => { clearInterval(this.t); this.setState({ phase: 'trigger', yours: [], toast: null }); };
  componentWillUnmount() { clearInterval(this.t); clearTimeout(this.tt); }
  renderVals() { const s = this.state; const c = s.line[0]; const W = [44, 38, 32, 26];
    const scoops = (arr) => arr.map((f, i) => ({ c: this.FLAV[f][0], w: W[i] + 'px' }));
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    return {
      stateLabel: s.phase.toUpperCase(), isTrigger: s.phase === 'trigger', isHowTo: s.phase === 'howto', isPlaying: s.phase === 'play', isDone: s.phase === 'done',
      startHowTo: () => this.setState({ phase: 'howto' }), backToTrigger: () => this.setState({ phase: 'trigger' }), decline: () => this.setState({ josh: 'Suit yourself.' }), startGame: this.start, quit: this.quit, togglePause: this.togglePause, onKey: this.onKey, serve: this.serve, undo: this.undo,
      wallet: s.wallet.toLocaleString(), tokens: s.tokens, tokensLabel: '+' + s.tokens, streak: s.streak, bestStreak: s.best, served: s.served, lost: s.lost,
      timeLabel: mm + ':' + String(ss).padStart(2, '0'), timePct: (s.time / 120 * 100).toFixed(1) + '%', rush: s.time <= 60 && s.time > 30 && s.phase === 'play',
      subline: s.paused ? 'PAUSED · PRESS P OR RESUME' : (s.time <= 60 && s.time > 30 ? 'RUSH HOUR · TOKENS DOUBLED · GO GO GO' : 'MARKET MINI-GAME · STACK THE ORDER, LEFT TO RIGHT · EARN TOKENS'),
      pauseLabel: s.paused ? 'RESUME' : 'PAUSE',
      line: s.line.map(x => ({ name: x.name, cap: x.cap, body: x.body, dots: x.order.map(f => this.FLAV[f][0]), patience: Math.max(0, x.patience).toFixed(0) + '%', border: x.patience < 35 ? '#00BDFF' : '#0C4B5F', pay: [0,5,10,15,25][x.order.length] })),
      currentName: c ? c.name.toUpperCase() : '—', targetScoops: c ? scoops(c.order) : [], yourScoops: scoops(s.yours), yoursCount: s.yours.length + ' / ' + (c ? c.order.length : 0),
      coneAnim: s.toast === 'WRONG ORDER' ? 'shake .3s ease-in-out' : 'none',
      flavors: this.FLAV.map(([col, label], i) => ({ c: col, label, key: i + 1, add: () => this.add(i) })),
      menu: [['Single', 5], ['Double', 10], ['Triple', 15], ['Hexle-size', 25]].map(([n, p]) => ({ n, p })),
      badgePct: Math.min(100, s.tokens / 2) + '%', joshLine: s.josh, toast: s.toast, toastBg: s.toastBg,
      gotBadge: s.tokens >= 200, resultTitle: s.tokens >= 200 ? 'BRAIN FREEZE!' : (s.tokens >= 100 ? 'SOLID SHIFT' : 'ROUGH SHIFT'),
      resultLine: s.tokens >= 200 ? 'You are hired. Permanently. No exit.' : (s.tokens >= 100 ? 'Not bad. Blue raspberry carried you.' : 'The Hexle stand thanks you for the customers.')
    }; }
}