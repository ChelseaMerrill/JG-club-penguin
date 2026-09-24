/* @ds-bundle: {"format":4,"namespace":"JahnelGroupDesignSystem_019df6","components":[],"sourceHashes":{"ui_kits/marketing-site/HomePage.jsx":"b8d47e887c6f","ui_kits/marketing-site/Primitives.jsx":"0165bf115ef8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.JahnelGroupDesignSystem_019df6 = window.JahnelGroupDesignSystem_019df6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/marketing-site/HomePage.jsx
try { (() => {
/* global React */
const {
  useState,
  useEffect
} = React;

/* ---------- Hero (home page) ---------- */
function Hero({
  rotateWords = ["Serve You", "Grow With You", "Inspire You", "Grind For You"],
  onCta,
  onSecondary
}) {
  const [idx, setIdx] = useState(2);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % rotateWords.length), 2400);
    return () => clearInterval(t);
  }, [rotateWords.length]);
  return /*#__PURE__*/React.createElement("header", {
    className: "jg-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-hero-bg",
    style: {
      backgroundImage: `url("../../assets/imagery/team22.jpg")`
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "jg-hero-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "jg-hero-content"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "jg-h3",
    style: {
      color: "var(--jg-light)",
      fontSize: "calc(12px + 1.4vw)"
    }
  }, "World Class ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--jg-primary)"
    }
  }, "AI"), " Enabled Software Creators"), /*#__PURE__*/React.createElement("h1", {
    className: "jg-h1",
    style: {
      minHeight: "1.05em"
    }
  }, "Ready to\xA0", /*#__PURE__*/React.createElement("span", {
    className: "jg-rotate-word"
  }, rotateWords[idx])), /*#__PURE__*/React.createElement("h4", {
    className: "jg-h5",
    style: {
      color: "var(--jg-light)",
      fontSize: "calc(14px + 0.6vw)"
    }
  }, "Onshore, nearshore, and blended teams built for impact"), /*#__PURE__*/React.createElement("div", {
    className: "jg-hero-actions"
  }, /*#__PURE__*/React.createElement(ButtonContact, {
    onClick: onCta
  }, "Let's Talk"), /*#__PURE__*/React.createElement(ButtonContact, {
    onClick: onSecondary
  }, "Join Our Team"))), /*#__PURE__*/React.createElement("img", {
    className: "jg-hero-arrow",
    src: "../../assets/textures/arrow-down.svg",
    alt: ""
  }));
}

/* ---------- Client logo garden ---------- */
function ClientGarden() {
  const logos = ["deathwish", "google", "disney", "wb", "bethesda", "godaddy", "atos", "mit"];
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-section-bar"
  }, /*#__PURE__*/React.createElement(HeadingBar, {
    variant: "1-3"
  }, "Some Companies Who Trust Us")), /*#__PURE__*/React.createElement("div", {
    className: "jg-logo-garden"
  }, logos.map(l => /*#__PURE__*/React.createElement("img", {
    key: l,
    src: `../../assets/clients/${l}.png`,
    alt: l,
    className: "jg-client-logo"
  }))));
}

/* ---------- Services grid (what we do) ---------- */
function Services() {
  const items = [{
    ico: "service-software",
    t: "Enterprise Software Development",
    b: "Design and build bespoke software that streamlines processes, enhances productivity, and drives innovation for large organizations."
  }, {
    ico: "service-ai",
    t: "AI & Machine Learning",
    b: "Our team of AI Native developers leverage advanced tooling to skyrocket development initiatives and automate our clients' workflows."
  }, {
    ico: "service-staff",
    t: "Staff Augmentation",
    b: "Quickly scale your team with skilled developers who seamlessly integrate into your existing workflow and culture to accelerate your projects."
  }, {
    ico: "service-uiux",
    t: "UX/UI Design",
    b: "Design user-friendly and engaging interfaces that captivate users and elevate their overall experience."
  }, {
    ico: "service-cloud",
    t: "Cloud Infrastructure",
    b: "Design, deploy, and manage scalable cloud environments with integrated DevOps to optimize development, performance, and reduce costs."
  }, {
    ico: "service-data",
    t: "Data Analytics",
    b: "Transform raw data into actionable insights, enabling informed decision-making and strategic growth."
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-section-bar"
  }, /*#__PURE__*/React.createElement(HeadingBar, {
    variant: "auto-1"
  }, "Here's What We Do")), /*#__PURE__*/React.createElement("div", {
    className: "jg-services-grid"
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.t,
    className: "jg-service-card"
  }, /*#__PURE__*/React.createElement("img", {
    src: `../../assets/icons/${it.ico}.svg`,
    alt: "",
    className: "jg-service-ico"
  }), /*#__PURE__*/React.createElement("h4", {
    className: "jg-h4"
  }, it.t), /*#__PURE__*/React.createElement("p", {
    className: "jg-p"
  }, it.b)))), /*#__PURE__*/React.createElement("div", {
    className: "jg-section-cta"
  }, /*#__PURE__*/React.createElement(ButtonLearn, null, "Find out more")));
}

/* ---------- Testimonial carousel ---------- */
function Testimonials() {
  const slides = [{
    q: "...The Jahnel Group team was fantastic to work with — extremely flexible and accommodating for us as a pre-revenue start-up...",
    n: "Mike Martin",
    r: "Head of Technology, Advisor, aptihealth Inc."
  }, {
    q: "Every time I need a great developer or an entire software team, I simply call my friends at Jahnel Group and they deliver. They make my job easy...",
    n: "Vincent DeRobertis",
    r: "SVP of Commercial Strategy, Research Now"
  }, {
    q: "...Whether it's the flexibility in getting the right team with the right skills or simply providing insightful guidance on growth trajectory, the JG relationship has been phenomenal.",
    n: "Sean Austin",
    r: "Chief Executive Officer, Helios"
  }];
  const [i, setI] = useState(0);
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-testimonial-wrap"
  }, /*#__PURE__*/React.createElement("button", {
    className: "jg-carousel-arrow left",
    onClick: () => setI(p => (p - 1 + slides.length) % slides.length),
    "aria-label": "Previous"
  }, "\u2039"), /*#__PURE__*/React.createElement("div", {
    className: "jg-testimonial-card"
  }, /*#__PURE__*/React.createElement("p", {
    className: "jg-testimonial-q"
  }, "\u201C", slides[i].q, "\u201D"), /*#__PURE__*/React.createElement("div", {
    className: "jg-testimonial-author"
  }, /*#__PURE__*/React.createElement("p", {
    className: "jg-testimonial-n"
  }, slides[i].n), /*#__PURE__*/React.createElement("p", {
    className: "jg-testimonial-r"
  }, slides[i].r))), /*#__PURE__*/React.createElement("button", {
    className: "jg-carousel-arrow right",
    onClick: () => setI(p => (p + 1) % slides.length),
    "aria-label": "Next"
  }, "\u203A"), /*#__PURE__*/React.createElement("ol", {
    className: "jg-carousel-dots"
  }, slides.map((_, n) => /*#__PURE__*/React.createElement("li", {
    key: n,
    className: n === i ? "is-active" : "",
    onClick: () => setI(n)
  })))), /*#__PURE__*/React.createElement("div", {
    className: "jg-section-cta center"
  }, /*#__PURE__*/React.createElement(ButtonSeeMore, null, "Learn More")));
}

/* ---------- Awards (homepage) ---------- */
function Awards() {
  const data = [{
    logo: "../../assets/imagery/inc500.svg",
    t: "Inc. 5000",
    a: "Fastest Growing",
    l: "5 years"
  }, {
    logo: "../../assets/imagery/bptw.svg",
    t: "Best Places to Work",
    a: "Albany Business Review",
    l: "Multi-year"
  }, {
    logo: "../../assets/imagery/top-wp.svg",
    t: "Top Workplaces",
    a: "USA Today",
    l: "Recognized"
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-section-bar"
  }, /*#__PURE__*/React.createElement(HeadingBar, {
    variant: "3-1"
  }, "Awards & Recognition")), /*#__PURE__*/React.createElement("div", {
    className: "jg-awards"
  }, data.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.t,
    className: "jg-award-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-award-icon-area"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-award-icon-grad"
  }), /*#__PURE__*/React.createElement("img", {
    src: d.logo,
    alt: "",
    className: "jg-award-icon"
  })), /*#__PURE__*/React.createElement("div", {
    className: "jg-award-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-award-title"
  }, d.t), /*#__PURE__*/React.createElement("div", {
    className: "jg-award-a"
  }, d.a), /*#__PURE__*/React.createElement("div", {
    className: "jg-award-l"
  }, d.l))))));
}

/* ---------- We Are ---------- */
function WeAre() {
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section jg-we-are"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "jg-h2 center"
  }, "We Are"), /*#__PURE__*/React.createElement("h3", {
    className: "jg-h3 center"
  }, "150 people ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--jg-light)"
    }
  }, "across 27 states and 5 countries")), /*#__PURE__*/React.createElement("h3", {
    className: "jg-h3 center"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--jg-light)"
    }
  }, "Creating beautiful software for"), " 20 years", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--jg-light)"
    }
  }, ".")));
}

/* ---------- Contact form ---------- */
function ContactForm({
  onSubmit
}) {
  const [v, setV] = useState({
    name: "",
    email: "",
    company: "",
    msg: ""
  });
  return /*#__PURE__*/React.createElement("section", {
    className: "jg-section jg-contact-section",
    style: {
      backgroundImage: `url("../../assets/imagery/officebw.jpg")`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-contact-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "jg-contact-inner"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "jg-h2 center",
    id: "cT"
  }, "Ready to get started?"), /*#__PURE__*/React.createElement("h3", {
    className: "jg-h3 center",
    id: "cB"
  }, "Let's make it happen"), /*#__PURE__*/React.createElement("form", {
    className: "jg-form",
    onSubmit: e => {
      e.preventDefault();
      onSubmit?.(v);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-form-row"
  }, /*#__PURE__*/React.createElement("input", {
    className: "jg-input",
    placeholder: "Name",
    value: v.name,
    onChange: e => setV({
      ...v,
      name: e.target.value
    })
  }), /*#__PURE__*/React.createElement("input", {
    className: "jg-input",
    placeholder: "Email",
    type: "email",
    value: v.email,
    onChange: e => setV({
      ...v,
      email: e.target.value
    })
  })), /*#__PURE__*/React.createElement("input", {
    className: "jg-input",
    placeholder: "Company",
    value: v.company,
    onChange: e => setV({
      ...v,
      company: e.target.value
    })
  }), /*#__PURE__*/React.createElement("textarea", {
    className: "jg-input jg-textarea",
    placeholder: "Tell us about your project",
    value: v.msg,
    onChange: e => setV({
      ...v,
      msg: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "center"
  }, /*#__PURE__*/React.createElement("button", {
    className: "jg-btn jg-btn-contact",
    type: "submit"
  }, "Send it"))), /*#__PURE__*/React.createElement("h3", {
    className: "jg-h3 center",
    style: {
      marginTop: 40
    }
  }, "JG Headquarters"), /*#__PURE__*/React.createElement("p", {
    className: "jg-p center",
    style: {
      textAlign: "center"
    }
  }, "Come visit us on the 5th floor at 108 State St, Schenectady, NY 12305.")));
}

/* ---------- Footer ---------- */
function Footer() {
  const cols = [{
    h: "Menu",
    links: ["Home", "Our Process", "Services", "Clients", "Contact"]
  }, {
    h: "Company",
    links: ["Team", "Culture", "Careers", "Recruiting Services", "Site Map"]
  }, {
    h: "Media",
    links: ["Photo Gallery", "Video Gallery", "Press", "Insights", "Subscribe"]
  }];
  return /*#__PURE__*/React.createElement("footer", {
    className: "jg-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-footer-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "jg-footer-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/jg-logo-bars.svg",
    alt: "Jahnel Group"
  }), /*#__PURE__*/React.createElement(Socials, {
    size: 20
  })), cols.map(c => /*#__PURE__*/React.createElement("nav", {
    key: c.h,
    className: "jg-footer-col"
  }, /*#__PURE__*/React.createElement("h6", {
    className: "jg-h6",
    style: {
      fontSize: 16,
      marginBottom: 14
    }
  }, c.h), c.links.map(l => /*#__PURE__*/React.createElement("p", {
    key: l,
    className: "jg-footer-link"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, l))))), /*#__PURE__*/React.createElement("div", {
    className: "jg-footer-col"
  }, /*#__PURE__*/React.createElement("h6", {
    className: "jg-h6",
    style: {
      fontSize: 16,
      marginBottom: 14
    }
  }, "Contact"), /*#__PURE__*/React.createElement("p", {
    className: "jg-footer-link"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/icons/email.svg",
    alt: ""
  }), /*#__PURE__*/React.createElement("em", null, "general@jahnelgroup.com")), /*#__PURE__*/React.createElement("p", {
    className: "jg-footer-link"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/icons/call.svg",
    alt: ""
  }), /*#__PURE__*/React.createElement("em", null, "(518) 356-0039")), /*#__PURE__*/React.createElement("p", {
    className: "jg-footer-link"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/icons/pin.svg",
    alt: ""
  }), /*#__PURE__*/React.createElement("em", null, "108 State St, 5th Floor", /*#__PURE__*/React.createElement("br", null), "Schenectady, NY 12305")))), /*#__PURE__*/React.createElement("p", {
    className: "jg-footer-copy"
  }, "Copyright \xA9 ", new Date().getFullYear(), " Jahnel Group Inc. All rights reserved | Privacy Notice | Security & Compliance | AI Security"));
}
Object.assign(window, {
  Hero,
  ClientGarden,
  Services,
  Testimonials,
  Awards,
  WeAre,
  ContactForm,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/HomePage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-site/Primitives.jsx
try { (() => {
/* global React */
const {
  useState,
  useEffect,
  useRef
} = React;

/* =========================================================
   Jahnel Group — UI Kit components
   Recreated from jg-website-v2-2020-redesign source.
   ========================================================= */

/* ---------- HeadingBar — the signature teal stripes ---------- */
function HeadingBar({
  children,
  variant = "1-3"
}) {
  // 1-3: short stripe left, long stripe right of headline
  // 3-1: long stripe left, short stripe right
  const cols = variant === "3-1" ? "3fr auto auto auto 1fr" : variant === "auto-1" ? "auto auto auto auto 1fr" : "1fr auto auto auto 3fr";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateRows: "var(--heading-line-thickness) var(--heading-line-thickness) auto var(--heading-line-thickness) var(--heading-line-thickness)",
      gridTemplateColumns: cols,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridArea: "4 / 1 / 6 / 3",
      background: "var(--jg-secondary)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      gridArea: "2 / 4 / 3 / 6",
      background: "var(--jg-secondary)"
    }
  }), /*#__PURE__*/React.createElement("h2", {
    className: "jg-h2",
    style: {
      gridArea: "1 / 2 / 6 / 5",
      margin: 0,
      padding: "0 8px",
      textAlign: "center",
      lineHeight: 1
    }
  }, children));
}

/* ---------- Buttons ---------- */
function ButtonContact({
  children = "Let's Talk",
  onClick,
  href
}) {
  const Cmp = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Cmp, {
    href: href,
    onClick: onClick,
    className: "jg-btn jg-btn-contact"
  }, children);
}
function ButtonLearn({
  children = "Find out more",
  onClick,
  href
}) {
  const Cmp = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Cmp, {
    href: href,
    onClick: onClick,
    className: "jg-btn jg-btn-learn"
  }, children);
}
function ButtonSeeMore({
  children = "Learn More",
  side = "none",
  onClick,
  href
}) {
  const Cmp = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Cmp, {
    href: href,
    onClick: onClick,
    className: `jg-btn jg-btn-see-more-${side}`
  }, children);
}
function ButtonRecruit({
  children,
  onClick,
  href
}) {
  const Cmp = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Cmp, {
    href: href,
    onClick: onClick,
    className: "jg-btn jg-btn-recruit"
  }, children);
}

/* ---------- TopNav ---------- */
function TopNav({
  active = "home",
  onNavigate
}) {
  const left = [{
    id: "team",
    label: "Team"
  }, {
    id: "culture",
    label: "Culture"
  }, {
    id: "process",
    label: "Process"
  }];
  const right = [{
    id: "services",
    label: "Services"
  }, {
    id: "clients",
    label: "Clients"
  }, {
    id: "contact",
    label: "Contact"
  }];
  const Item = ({
    it
  }) => /*#__PURE__*/React.createElement("li", {
    className: "jg-nav-item"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate?.(it.id);
    },
    className: `jg-nav-link ${active === it.id ? "is-active" : ""}`
  }, it.label));
  return /*#__PURE__*/React.createElement("nav", {
    className: "jg-nav",
    "aria-label": "Main"
  }, /*#__PURE__*/React.createElement("ul", {
    className: "jg-nav-list jg-nav-left"
  }, left.map(it => /*#__PURE__*/React.createElement(Item, {
    key: it.id,
    it: it
  }))), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate?.("home");
    },
    className: "jg-nav-brand",
    "aria-label": "Jahnel Group home"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/jg-logo-bars.svg",
    alt: "Jahnel Group"
  })), /*#__PURE__*/React.createElement("ul", {
    className: "jg-nav-list jg-nav-right"
  }, right.map(it => /*#__PURE__*/React.createElement(Item, {
    key: it.id,
    it: it
  }))));
}

/* ---------- Socials row ---------- */
function Socials({
  size = 24
}) {
  const items = ["linkedin", "instagram", "facebook", "youtube", "x"];
  return /*#__PURE__*/React.createElement("div", {
    className: "jg-socials"
  }, items.map(n => /*#__PURE__*/React.createElement("a", {
    key: n,
    href: "#",
    "aria-label": n,
    className: "jg-social"
  }, /*#__PURE__*/React.createElement("img", {
    src: `../../assets/icons/${n}.svg`,
    alt: "",
    style: {
      width: size,
      height: size
    }
  }))));
}
Object.assign(window, {
  HeadingBar,
  ButtonContact,
  ButtonLearn,
  ButtonSeeMore,
  ButtonRecruit,
  TopNav,
  Socials
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/Primitives.jsx", error: String((e && e.message) || e) }); }

})();
