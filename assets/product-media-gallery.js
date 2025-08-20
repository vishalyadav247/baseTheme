/* Product Media Gallery (Vanilla JS) — vertical thumbs desktop, horizontal mobile */
(function () {
    const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
    const qs = (root, sel) => root && root.querySelector(sel);
    const qsa = (root, sel) => (root ? Array.from(root.querySelectorAll(sel)) : []);

    class Slider {
        constructor(root) {
            this.root = root;
            this.track = qs(root, '.pmg-track');
            if (!this.track) return;

            // Main
            this.slides = qsa(root, '.pmg-slide');
            this.prevBtn = qs(root, '.pmg-prev');
            this.nextBtn = qs(root, '.pmg-next');
            this.dots = qsa(root, '.pmg-dot');
            this.counterCurrent = qs(root, '.pmg-current');

            // Thumbs
            this.thumbWrap = qs(root, '.pmg-thumbs-track');
            this.thumbBtns = qsa(root, '.pmg-thumb');
            this.thumbPrev = qs(root, '.pmg-thumbs-prev');
            this.thumbNext = qs(root, '.pmg-thumbs-next');

            // Lightbox
            this.lb = qs(root, '.pmg-lightbox');
            this.lbImg = qs(root, '.pmg-lightbox-img');
            this.lbPrev = qs(root, '.pmg-lightbox-prev');
            this.lbNext = qs(root, '.pmg-lightbox-next');
            this.lbClose = qs(root, '.pmg-lightbox-close');
            this.lbCur = qs(root, '.pmg-lightbox-current');
            this.lbTot = qs(root, '.pmg-lightbox-total');
            this.lbBackdrop = qs(root, '.pmg-lightbox-backdrop');

            // Settings
            this.loop = root.dataset.loop === 'true';
            this.autoplay = root.dataset.autoplay === 'true';
            this.autoplaySpeed = parseInt(root.dataset.autoplaySpeed || '3500', 10);

            // State
            this.index = 0;
            this.total = this.slides.length || 0;

            // Drag state (main)
            this.isDragging = false;
            this.startX = 0;
            this.dragDx = 0;
            this.didDrag = false;

            // Thumbs drag/click guard
            this._thumbWasDragging = false;
            this._thumbDragThreshold = 4;

            this.slideWidth = () => this.track.clientWidth;

            this.bind();
            this.update(false);
            if (this.autoplay) this.startAutoplay();
        }

        // --- orientation helpers for thumbs ---
        thumbsHorizontal() {
            return this.thumbWrap && getComputedStyle(this.thumbWrap).display.includes('flex');
        }
        pageStep() {
            if (!this.thumbWrap) return 160;
            return this.thumbsHorizontal()
                ? Math.max(120, Math.floor(this.thumbWrap.clientWidth * 0.85))   // horizontal
                : Math.max(140, Math.floor(this.thumbWrap.clientHeight * 0.85)); // vertical
        }

        // --- core slider ---
        translateX(px) { this.track.style.transform = `translate3d(${px}px,0,0)`; }
        snap() { this.track.style.transition = 'transform 280ms ease'; this.translateX(-this.index * this.slideWidth()); }
        goTo(i) { this.index = clamp(i, 0, this.total - 1); this.update(true); }
        prev() { if (this.index > 0) this.index--; else if (this.loop && this.total) this.index = this.total - 1; this.update(true); }
        next() { if (this.index < this.total - 1) this.index++; else if (this.loop && this.total) this.index = 0; this.update(true); }

        update(animate = false) {
            this.track.style.transition = animate ? 'transform 300ms ease' : 'none';
            this.translateX(-this.index * this.slideWidth());

            this.slides.forEach(s => s.classList.remove('is-active'));
            this.slides[this.index]?.classList.add('is-active');

            this.dots.forEach(d => d.classList.remove('is-active'));
            this.dots[this.index]?.classList.add('is-active');

            this.thumbBtns.forEach(t => t.classList.remove('is-active'));
            this.thumbBtns[this.index]?.classList.add('is-active');

            this.counterCurrent && (this.counterCurrent.textContent = String(this.index + 1));
            this.ensureActiveThumbInView();
        }

        ensureActiveThumbInView() {
            const active = this.thumbBtns[this.index];
            if (!active || !this.thumbWrap) return;

            const wrap = this.thumbWrap.getBoundingClientRect();
            const itm = active.getBoundingClientRect();

            if (this.thumbsHorizontal()) {
                if (itm.left < wrap.left) this.thumbWrap.scrollBy({ left: itm.left - wrap.left - 6, behavior: 'smooth' });
                if (itm.right > wrap.right) this.thumbWrap.scrollBy({ left: itm.right - wrap.right + 6, behavior: 'smooth' });
            } else {
                if (itm.top < wrap.top) this.thumbWrap.scrollBy({ top: itm.top - wrap.top - 6, behavior: 'smooth' });
                if (itm.bottom > wrap.bottom) this.thumbWrap.scrollBy({ top: itm.bottom - wrap.bottom + 6, behavior: 'smooth' });
            }
        }

        bind() {
            // Arrows
            this.prevBtn?.addEventListener('click', (e) => { e.preventDefault(); this.prev(); });
            this.nextBtn?.addEventListener('click', (e) => { e.preventDefault(); this.next(); });

            // Dots
            this.dots.forEach(d => d.addEventListener('click', (e) => {
                e.preventDefault();
                this.goTo(parseInt(d.dataset.index, 10));
            }));

            // Thumbs click (guard against drag)
            this.thumbBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (this._thumbWasDragging) { e.preventDefault(); return; }
                    e.preventDefault();
                    this.goTo(parseInt(btn.dataset.index, 10));
                    this.snap();
                });
            });

            // --- Thumbs: wheel + drag (orientation-aware) ---
            if (this.thumbWrap) {
                const WHEEL_SCALE = 0.18;  // lower = slower
                const WHEEL_CAP = 60;    // cap spikes
                const EASE = 0.26;  // easing per frame

                let targetX = this.thumbWrap.scrollLeft;
                let targetY = this.thumbWrap.scrollTop;
                let animating = false;

                const maxLeft = () => this.thumbWrap.scrollWidth - this.thumbWrap.clientWidth;
                const maxTop = () => this.thumbWrap.scrollHeight - this.thumbWrap.clientHeight;

                const animate = () => {
                    if (!animating) return;
                    const horiz = this.thumbsHorizontal();
                    if (horiz) {
                        const cur = this.thumbWrap.scrollLeft;
                        const diff = targetX - cur;
                        if (Math.abs(diff) < 0.5) { this.thumbWrap.scrollLeft = targetX; animating = false; return; }
                        this.thumbWrap.scrollLeft = cur + diff * EASE;
                    } else {
                        const cur = this.thumbWrap.scrollTop;
                        const diff = targetY - cur;
                        if (Math.abs(diff) < 0.5) { this.thumbWrap.scrollTop = targetY; animating = false; return; }
                        this.thumbWrap.scrollTop = cur + diff * EASE;
                    }
                    requestAnimationFrame(animate);
                };

                this.thumbWrap.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    let raw = Math.abs(e.deltaY) > 0 ? e.deltaY : e.deltaX;
                    if (e.deltaMode === 1) raw *= 16; // lines → px
                    else if (e.deltaMode === 2) raw *= this.thumbsHorizontal() ? this.thumbWrap.clientWidth : this.thumbWrap.clientHeight;

                    const capped = Math.sign(raw) * Math.min(Math.abs(raw), WHEEL_CAP);
                    if (this.thumbsHorizontal()) {
                        targetX = Math.max(0, Math.min(targetX + capped * WHEEL_SCALE, maxLeft()));
                    } else {
                        targetY = Math.max(0, Math.min(targetY + capped * WHEEL_SCALE, maxTop()));
                    }
                    if (!animating) { animating = true; requestAnimationFrame(animate); }
                }, { passive: false });

                // Drag to scroll
                this.thumbWrap.addEventListener('pointerdown', (e) => {
                    animating = false;
                    targetX = this.thumbWrap.scrollLeft;
                    targetY = this.thumbWrap.scrollTop;

                    this.thumbDragging = true;
                    this.tStartX = e.clientX;
                    this.tStartY = e.clientY;
                    this.tStartLeft = this.thumbWrap.scrollLeft;
                    this.tStartTop = this.thumbWrap.scrollTop;
                    this._thumbWasDragging = false;
                });

                this.thumbWrap.addEventListener('pointermove', (e) => {
                    if (!this.thumbDragging) return;
                    const horiz = this.thumbsHorizontal();
                    if (horiz) {
                        const dx = e.clientX - this.tStartX;
                        if (!this._thumbWasDragging && Math.abs(dx) >= this._thumbDragThreshold) this._thumbWasDragging = true;
                        this.thumbWrap.scrollLeft = this.tStartLeft - dx;
                        targetX = this.thumbWrap.scrollLeft;
                    } else {
                        const dy = e.clientY - this.tStartY;
                        if (!this._thumbWasDragging && Math.abs(dy) >= this._thumbDragThreshold) this._thumbWasDragging = true;
                        this.thumbWrap.scrollTop = this.tStartTop - dy;
                        targetY = this.thumbWrap.scrollTop;
                    }
                }, { passive: true });

                const endThumbDrag = () => {
                    if (!this.thumbDragging) return;
                    this.thumbDragging = false;
                    setTimeout(() => { this._thumbWasDragging = false; }, 50);
                };
                window.addEventListener('pointerup', endThumbDrag);
                window.addEventListener('pointercancel', endThumbDrag);

                // Nav buttons (desktop vertical)
                const jump = (dir) => {
                    const step = this.pageStep();
                    if (this.thumbsHorizontal()) {
                        targetX = Math.max(0, Math.min(this.thumbWrap.scrollLeft + dir * step, maxLeft()));
                    } else {
                        targetY = Math.max(0, Math.min(this.thumbWrap.scrollTop + dir * step, maxTop()));
                    }
                    if (!animating) { animating = true; requestAnimationFrame(animate); }
                };
                this.thumbPrev?.addEventListener('click', (e) => { e.preventDefault(); jump(-1); });
                this.thumbNext?.addEventListener('click', (e) => { e.preventDefault(); jump(1); });
            }

            // Main track drag/swipe (no pointer capture so clicks pass)
            this.track.addEventListener('pointerdown', (e) => {
                this.isDragging = true; this.didDrag = false; this.startX = e.clientX; this.dragDx = 0;
                this.track.style.transition = 'none';
            }, { passive: true });

            this.track.addEventListener('pointermove', (e) => {
                if (!this.isDragging) return;
                this.dragDx = e.clientX - this.startX;
                if (Math.abs(this.dragDx) > 3) this.didDrag = true;
                this.translateX(-this.index * this.slideWidth() + this.dragDx);
            }, { passive: true });

            const endMainDrag = () => {
                if (!this.isDragging) return;
                this.isDragging = false;
                const threshold = Math.min(120, this.slideWidth() * 0.22);
                if (this.dragDx > threshold) this.prev();
                else if (this.dragDx < -threshold) this.next();
                else this.snap();
                setTimeout(() => { this.didDrag = false; }, 50);
            };
            window.addEventListener('pointerup', endMainDrag);
            window.addEventListener('pointercancel', endMainDrag);

            // Prevent ghost-drag on images
            qsa(this.root, 'img').forEach(img => {
                img.setAttribute('draggable', 'false');
                img.addEventListener('dragstart', e => e.preventDefault());
            });

            // Lightbox open on true click
            qsa(this.root, '.pmg-open-lightbox').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (this.didDrag) return;
                    const slide = btn.closest('.pmg-slide');
                    const idx = parseInt(slide?.dataset?.index || '0', 10);
                    this.openLightbox(idx);
                });
            });

            // Lightbox controls
            this.lbPrev?.addEventListener('click', () => this.lightboxPrev());
            this.lbNext?.addEventListener('click', () => this.lightboxNext());
            this.lbClose?.addEventListener('click', () => this.closeLightbox());
            this.lbBackdrop?.addEventListener('click', () => this.closeLightbox());
            document.addEventListener('keydown', (e) => {
                if (this.lb?.hidden) return;
                if (e.key === 'Escape') this.closeLightbox();
                if (e.key === 'ArrowLeft') this.lightboxPrev();
                if (e.key === 'ArrowRight') this.lightboxNext();
            });

            // Resize snap
            window.addEventListener('resize', () => this.snap());
        }

        // --- autoplay ---
        startAutoplay() { this.stopAutoplay(); this.autoplayTimer = setInterval(() => this.next(), this.autoplaySpeed); }
        stopAutoplay() { if (this.autoplayTimer) clearInterval(this.autoplayTimer); this.autoplayTimer = null; }

        // --- lightbox ---
        openLightbox(i) {
            if (!this.lb || !this.lbImg) return;
            this.lb.hidden = false;
            this.lb.setAttribute('aria-hidden', 'false');
            this.lb.classList.add('is-open');
            this.lbTot && (this.lbTot.textContent = String(this.total));
            this.lbIndex = clamp(i, 0, this.total - 1);
            this.renderLightbox();
            document.documentElement.classList.add('pmg-no-scroll');
        }
        closeLightbox() {
            if (!this.lb) return;
            this.lb.classList.remove('is-open');
            this.lb.hidden = true;
            this.lb.setAttribute('aria-hidden', 'true');
            document.documentElement.classList.remove('pmg-no-scroll');
        }
        lightboxPrev() { if (this.lbIndex > 0) this.lbIndex--; else if (this.loop && this.total) this.lbIndex = this.total - 1; this.renderLightbox(); }
        lightboxNext() { if (this.lbIndex < this.total - 1) this.lbIndex++; else if (this.loop && this.total) this.lbIndex = 0; this.renderLightbox(); }
        renderLightbox() {
            const slide = this.slides[this.lbIndex];
            const img = slide?.querySelector('img');
            if (!img) return;
            this.lbImg.src = img.currentSrc || img.src;
            this.lbImg.alt = img.alt || '';
            this.lbCur && (this.lbCur.textContent = String(this.lbIndex + 1));
        }
    }

    window.ProductMediaGallery = { init: (root) => new Slider(root) };
})();
