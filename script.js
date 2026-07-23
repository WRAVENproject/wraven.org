// WRAVEN.ORG

/* ── Site data: single source of truth ─────────────────────────────
   Edit numbers and featured posts here. Elements with a matching
   data-stat attribute and the #research-grid section are populated
   from these on load. index.html carries the same values as static
   no-JS fallbacks; update them together. */

const SITE_STATS = {
    operators: 59,
    operations: 14,
    ctfEvents: 128,
    opsActive: 1,
    opsCompleted: 13,
    ctfHackers: 39,
    ctfYears: 13
};

const FEATURED_RESEARCH = [
    {
        url: 'https://blog.wraven.org/p/wraven-intel-brief-stryker-attack',
        tag: 'Intel Brief',
        title: 'Stryker Cyber Incident & Iran-Linked Handala Activity',
        desc: 'Analysis of the Stryker incident and Handala / Iran-linked operations, with defensive takeaways.',
        meta: 'Mar 2026 · 10 min read'
    },
    {
        url: 'https://blog.wraven.org/p/scattered-spider-tactics-targets-and-wraven-s-ongoing-threat-intel-tracking',
        tag: 'APT Report',
        title: 'Scattered Spider: Tactics, Targets & Ongoing Tracking',
        desc: 'How a small hacker crew pulls off multi-million dollar breaches, and how our students track them in real time.',
        meta: 'Jul 2025 · 4 min read'
    },
    {
        url: 'https://blog.wraven.org/p/qilin-a-look-inside-a-modern-ransomware-operation',
        tag: 'Research Paper',
        title: 'Qilin: A Look Inside a Modern Ransomware Operation',
        desc: 'Inside the operations of a fast-evolving ransomware-as-a-service network.',
        meta: 'Oct 2025 · 2 min read'
    }
];

document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('[data-stat]').forEach(el => {
        const key = el.getAttribute('data-stat');
        if (key in SITE_STATS) el.textContent = SITE_STATS[key];
    });

    const researchGrid = document.getElementById('research-grid');
    if (researchGrid && FEATURED_RESEARCH.length) {
        researchGrid.textContent = '';
        FEATURED_RESEARCH.forEach(post => {
            const card = document.createElement('a');
            card.className = 'research-card';
            card.href = post.url;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const tag = document.createElement('span');
            tag.className = 'research-tag';
            tag.textContent = post.tag;

            const title = document.createElement('h3');
            title.className = 'research-title';
            title.textContent = post.title;

            const desc = document.createElement('p');
            desc.className = 'research-desc';
            desc.textContent = post.desc;

            const meta = document.createElement('span');
            meta.className = 'research-meta';
            meta.textContent = post.meta;

            card.append(tag, title, desc, meta);
            researchGrid.appendChild(card);
        });
    }

    const navToggle = document.getElementById('nav-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            mobileMenu.classList.toggle('open');
            document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
        });

        mobileMenu.querySelectorAll('.mobile-link').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('active');
                mobileMenu.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                const top = target.getBoundingClientRect().top + window.pageYOffset - 80;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    const nav = document.getElementById('nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.style.borderBottomColor = window.pageYOffset > 100 ? 'rgba(255,255,255,0.08)' : '';
        }, { passive: true });
    }

    const uptimeEl = document.getElementById('uptime');
    if (uptimeEl) {
        const startTime = new Date('2024-11-30T15:00:00-05:00');
        function updateUptime() {
            const ms = Date.now() - startTime.getTime();
            if (!Number.isFinite(ms) || ms < 0) return;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            uptimeEl.textContent = `${d}d ${h}h ${m}m`;
            const wrap = uptimeEl.closest('.footer-uptime');
            if (wrap) wrap.hidden = false;
        }
        updateUptime();
        setInterval(updateUptime, 60000);
    }


    /* ── Scroll-reveal: staggered children with subtle blur-lift ── */
    const revealContainers = document.querySelectorAll(
        '.about-grid, .threat-table, .ops-grid, .platforms-row, .ctf-split, .partners-row'
    );

    if (revealContainers.length && 'IntersectionObserver' in window) {

        const style = document.createElement('style');
        style.textContent = `
            .reveal-child {
                opacity: 0;
                transform: translateY(12px) scale(0.985);
                filter: blur(4px);
                will-change: opacity, transform, filter;
                transition:
                    opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                    filter  0.7s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .reveal-child.revealed {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0);
            }
        `;
        document.head.appendChild(style);

        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const children = entry.target.querySelectorAll('.reveal-child');
                children.forEach((child, i) => {
                    setTimeout(() => child.classList.add('revealed'), i * 90);
                });
                revealObserver.unobserve(entry.target);
            });
        }, { threshold: 0.05, rootMargin: '0px 0px -60px 0px' });

        revealContainers.forEach(container => {
            const kids = container.children;
            if (kids.length <= 1) {
                container.classList.add('reveal-child');
                const wrapper = container.parentElement || container;
                revealObserver.observe(wrapper === container ? container : wrapper);
                // still observe the container itself
                revealObserver.observe(container);
            } else {
                Array.from(kids).forEach(child => child.classList.add('reveal-child'));
                revealObserver.observe(container);
            }
        });
    }

    const logoImg = document.querySelector('.nav-logo-img');
    const logoText = document.querySelector('.nav-logo-text');
    if (logoImg && logoText) {
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            logoImg.style.opacity = '1';
            logoText.style.display = 'none';
        }
        logoImg.addEventListener('load', () => { logoImg.style.opacity = '1'; logoText.style.display = 'none'; });
        logoImg.addEventListener('error', () => { logoImg.style.display = 'none'; logoText.style.display = 'inline'; });
    }

    // Radar
    const radarCanvas = document.getElementById('hero-radar');
    if (radarCanvas) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            radarCanvas.style.display = 'none';
        } else {
        const ctx = radarCanvas.getContext('2d');
        const isSmallScreen = window.innerWidth < 1024;
        const size = isSmallScreen ? 700 : 1100;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        radarCanvas.width = size * dpr;
        radarCanvas.height = size * dpr;
        radarCanvas.style.width = (isSmallScreen ? 700 : 1100) + 'px';
        radarCanvas.style.height = (isSmallScreen ? 700 : 1100) + 'px';
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const maxR = size / 2 - 20;
        let angle = 0;
        const PI2 = Math.PI * 2;
        const rings = [0.25, 0.5, 0.75, 1.0];
        let time = 0;

        function getSpeed() {
            return 0.0025 + Math.sin(time * 0.0007) * 0.0012 + Math.sin(time * 0.003) * 0.0004;
        }

        const ticks = [];
        for (let deg = 0; deg < 360; deg += 10) {
            ticks.push({ rad: deg * Math.PI / 180, major: deg % 30 === 0 });
        }

        const blips = [
            { r: 0.30, a: 0.8,  label: 'T-01', size: 2.5 },
            { r: 0.55, a: 2.4,  label: null,    size: 2 },
            { r: 0.70, a: 4.1,  label: 'T-03', size: 3 },
            { r: 0.42, a: 5.5,  label: null,    size: 2 },
            { r: 0.85, a: 1.2,  label: 'T-05', size: 2.5 },
            { r: 0.62, a: 3.6,  label: null,    size: 1.5 },
            { r: 0.20, a: 0.3,  label: null,    size: 2 },
            { r: 0.78, a: 5.0,  label: 'T-08', size: 3 },
            { r: 0.48, a: 1.8,  label: null,    size: 1.5 },
            { r: 0.90, a: 3.1,  label: 'T-10', size: 2 },
        ];

        const arcs = [
            { r: 0.38, start: 0.4, len: 0.5 },
            { r: 0.63, start: 2.8, len: 0.7 },
            { r: 0.88, start: 4.5, len: 0.4 },
        ];

        function drawRadar() {
            if (!radarRunning) return;
            ctx.clearRect(0, 0, size, size);
            time++;

            const breathe = Math.sin(time * 0.008) * 0.08;

            rings.forEach((pct, i) => {
                const pulse = i === rings.length - 1 ? breathe : 0;
                ctx.beginPath();
                ctx.arc(cx, cy, maxR * pct, 0, PI2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + pulse})`;
                ctx.lineWidth = i === rings.length - 1 ? 1.2 : 0.7;
                ctx.stroke();
            });

            ctx.save();
            ctx.setLineDash([4, 8]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
            ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.setLineDash([2, 12]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 0.5;
            const diag = maxR * 0.707;
            ctx.beginPath();
            ctx.moveTo(cx - diag, cy - diag); ctx.lineTo(cx + diag, cy + diag);
            ctx.moveTo(cx + diag, cy - diag); ctx.lineTo(cx - diag, cy + diag);
            ctx.stroke();
            ctx.restore();

            ticks.forEach(t => {
                const innerR = maxR * (t.major ? 0.95 : 0.97);
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(t.rad) * innerR, cy + Math.sin(t.rad) * innerR);
                ctx.lineTo(cx + Math.cos(t.rad) * maxR, cy + Math.sin(t.rad) * maxR);
                ctx.strokeStyle = `rgba(255, 255, 255, ${t.major ? 0.25 : 0.10})`;
                ctx.lineWidth = t.major ? 1 : 0.5;
                ctx.stroke();
            });

            arcs.forEach(a => {
                ctx.beginPath();
                ctx.arc(cx, cy, maxR * a.r, a.start, a.start + a.len);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 0.7;
                ctx.stroke();
            });

            const lineGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
            lineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
            lineGrad.addColorStop(0.15, 'rgba(255, 255, 255, 0.4)');
            lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            blips.forEach(b => {
                const bx = cx + Math.cos(b.a) * (maxR * b.r);
                const by = cy + Math.sin(b.a) * (maxR * b.r);
                const diff = ((angle - b.a) % PI2 + PI2) % PI2;
                const brightness = diff < 3.0 ? Math.pow(Math.max(0, 1 - diff / 3.0), 2) : 0;

                if (brightness > 0.05) {
                    ctx.beginPath();
                    ctx.arc(bx, by, 10, 0, PI2);
                    ctx.fillStyle = `rgba(200, 60, 60, ${brightness * 0.05})`;
                    ctx.fill();
                }
                if (brightness > 0.1) {
                    ctx.beginPath();
                    ctx.arc(bx, by, 5, 0, PI2);
                    ctx.fillStyle = `rgba(200, 60, 60, ${brightness * 0.10})`;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(bx, by, b.size, 0, PI2);
                ctx.fillStyle = `rgba(200, 60, 60, ${0.12 + brightness * 0.55})`;
                ctx.fill();

                if (b.label && brightness > 0.2) {
                    ctx.font = '9px JetBrains Mono, monospace';
                    ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.45})`;
                    ctx.fillText(b.label, bx + 8, by - 6);
                }
            });

            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, PI2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + breathe * 0.3})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, PI2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fill();

            angle += getSpeed();
            if (angle > PI2) angle -= PI2;
            requestAnimationFrame(drawRadar);
        }

        const heroSection = document.querySelector('.hero');
        let radarRunning = false;
        const radarObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !radarRunning) {
                    radarRunning = true;
                    drawRadar();
                } else if (!entry.isIntersecting) {
                    radarRunning = false;
                }
            });
        }, { threshold: 0.1 });
        radarObserver.observe(heroSection);
        } // end !isMobile
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('open')) {
            navToggle.classList.remove('active');
            mobileMenu.classList.remove('open');
            document.body.style.overflow = '';
        }
    });

});
