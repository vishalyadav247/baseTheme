// variant selector js
document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-product-info]");
  if (!root) return;

  const sectionId = root
    .closest("[data-product-info]")
    ?.getAttribute("data-section-id");
  const selectEl = root.querySelector("[data-variant-select]");
  const idField =
    root.querySelector('input[name="id"][data-variant-id-field]') ||
    root.querySelector('input[name="id"]');
  const priceBox = root.querySelector("[data-price]");
  const skuEl = root.querySelector("[data-sku]");
  const barcodeEl = root.querySelector("[data-barcode]");
  const atcBtn = root.querySelector("[data-atc]");
  const payWrap = root.querySelector("[data-payment-button]");
  const msgBox = root.querySelector("[data-notifications]");
  const swatchRoot = root.querySelector("[data-swatch-root]");
  const qtyInput = root.querySelector("[data-qty-input]");
  const minusBtn = root.querySelector("[data-qty-minus]");
  const plusBtn = root.querySelector("[data-qty-plus]");
  const availableQuantity = root.querySelector("[data-avalable-quantity]");

  // Variants JSON
  const variants = (() => {
    try {
      return JSON.parse(
        document.querySelector("[data-variants-json]")?.textContent || "[]"
      );
    } catch (_) {
      return [];
    }
  })();

  const byId = new Map(variants.map((v) => [String(v.id), v]));
  const keyOf = (a) => (a || []).filter(Boolean).join("||");
  const byKey = new Map(
    variants.map((v) => [keyOf([v.option1, v.option2, v.option3]), v])
  );

  // notifications
  function showMessage(type, text, timeoutMs = 5000) {
    if (!msgBox || !text) return;
    msgBox.style.visibility = "visible";
    msgBox.textContent = text;
    // Simple styling
    if (type === "error") {
      msgBox.classList.add("text-red-600");
      msgBox.classList.remove("text-green-600");
    } else if (type === "success") {
      msgBox.classList.remove("text-red-600");
      msgBox.classList.add("text-green-600");
      setTimeout(() => {
        msgBox.style.visibility = "hidden";
        msgBox.textContent = "";
      }, timeoutMs);
    } else if (type === "clear") {
      msgBox.classList.remove("text-red-600");
      msgBox.classList.add("text-green-600");
      msgBox.textContent = "";
    }
  }

  function updateMessage(v) {
    if (!v.available) {
      showMessage("error", "This variant is out of stock.");
    } else if (
      v.available &&
      v.inventory_policy == "deny" &&
      qtyInput.value > v.inventory_quantity
    ) {
      showMessage(
        "error",
        `Sorry! Currently you can't add more then ${v.inventory_quantity} quantities.`
      );
    } else {
      showMessage("clear", "a");
    }
  }

  function updateStockAvailablity(v, availableQuantity) {
    const qty =
      typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0;

    // Build the label
    const label =
      v.inventory_policy === "continue"
        ? "In Stock"
        : qty === 0
        ? "Out Of Stock"
        : `In Stock (${qty})`;

    // Write text
    availableQuantity.textContent = label;

    // Decide "in stock" for styling
    const inStock = v.inventory_policy === "continue" || qty > 0;

    // Toggle classes
    availableQuantity.classList.toggle("text-green-600", inStock);
    availableQuantity.classList.toggle("text-red-600", !inStock);
  }

  // how many units of a variant are already in the cart
  async function cartQtyForVariant(variantId) {
    try {
      const cart = await fetch("/cart.js", {
        headers: { Accept: "application/json" },
      }).then((r) => r.json());
      let total = 0;
      for (const li of cart.items || []) {
        if (String(li.variant_id) === String(variantId))
          total += Number(li.quantity) || 0;
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  // URL and UI updates
  function updateUrl(variantId) {
    const u = new URL(location.href);
    u.searchParams.set("variant", variantId);
    history.replaceState({}, "", u.toString());
  }

  function updateATC(v) {
    if (!atcBtn) return;
    const qty = clampQty(qtyInput?.value);

    const variantAvailable = !!v?.available;
    const qtyOk = qty <= v.inventory_quantity ? true : false;

    if (!variantAvailable) {
      atcBtn.disabled = true;
      atcBtn.setAttribute("aria-disabled", "true");
      atcBtn.textContent = "Out Of Stock";
    } else if (variantAvailable && v.inventory_policy == "deny" && !qtyOk) {
      atcBtn.disabled = true;
      atcBtn.setAttribute("aria-disabled", "true");
      atcBtn.textContent = "Add to cart";
    } else if (variantAvailable && v.inventory_policy == "continue") {
      atcBtn.disabled = false;
      atcBtn.setAttribute("aria-disabled", "false");
      atcBtn.textContent = "Pre - Order";
    } else {
      atcBtn.disabled = false;
      atcBtn.setAttribute("aria-disabled", "false");
      atcBtn.textContent = "Add to cart";
    }
  }

  function updateSkuBarcode(v) {
    if (skuEl) skuEl.textContent = v?.sku || "";
    if (barcodeEl) barcodeEl.textContent = v?.barcode || "";
  }

  function updateFeaturedMedia(v) {
    const mediaId = v?.featured_media?.id || v?.featured_media_id;
    const gal = document.querySelector("[data-product-gallery]"); // (if you keep this)
    if (!mediaId) return;

    // Use our registry (sectionId you already computed earlier)
    const slider = window.ProductMediaGallery?.registry?.[sectionId];
    if (slider && typeof slider.goToMediaId === "function") {
      slider.goToMediaId(mediaId);
      return;
    }

    // Fallback (older behavior) – optional
    const wrap = document.getElementById(`product-media-gallery-${sectionId}`);
    if (!wrap) return;
    wrap
      .querySelectorAll(
        ".product-media-slide.is-active, .product-media-thumb.is-active"
      )
      .forEach((el) => el.classList.remove("is-active"));

    wrap
      .querySelector(
        `.product-media-slide[data-media-id="${CSS.escape(String(mediaId))}"]`
      )
      ?.classList.add("is-active");
    wrap
      .querySelector(
        `.product-media-thumb[data-media-id="${CSS.escape(String(mediaId))}"]`
      )
      ?.classList.add("is-active");
  }

  // at top-level (near other consts)
  let serverBitsAbort;

  // Fetch price & dynamic checkout HTML from backend and replace in-place
  async function refreshServerBits(variantId) {
    if (!sectionId) return;

    // cancel any in-flight request
    if (serverBitsAbort) serverBitsAbort.abort();
    serverBitsAbort = new AbortController();

    const url = `${location.pathname}?section_id=${encodeURIComponent(
      sectionId
    )}&variant=${encodeURIComponent(variantId)}`;

    try {
      const html = await fetch(url, {
        credentials: "same-origin",
        signal: serverBitsAbort.signal,
      }).then((r) => r.text());

      const doc = new DOMParser().parseFromString(html, "text/html");

      // Price snippet (handles price, compare_at, save, unit price)
      const newPrice = doc.querySelector(
        `#price-container-${CSS.escape(sectionId)}`
      );
      if (newPrice && priceBox) priceBox.innerHTML = newPrice.innerHTML;

      // Dynamic checkout button must come from backend
      const newPay = doc.querySelector("[data-payment-button]");
      if (newPay && payWrap) payWrap.innerHTML = newPay.innerHTML;
    } catch (err) {
      if (err.name !== "AbortError")
        console.warn("refreshServerBits failed:", err);
    }
  }

  // Read picks from UI
  function getOptionPicks() {
    if (!swatchRoot) {
      const v = byId.get(String(selectEl?.value));
      return [v?.option1 || "", v?.option2 || "", v?.option3 || ""];
    }
    const groups = [...swatchRoot.querySelectorAll("[data-swatch-group]")];
    return groups.map((g) => {
      const kind = g.getAttribute("data-kind");
      if (kind === "dropdown") {
        return g.querySelector("[data-swatch-select]")?.value || "";
      }
      return (
        g
          .querySelector('[data-swatch][data-active="true"]')
          ?.getAttribute("data-option-value") || ""
      );
    });
  }

  function findVariantForPicks() {
    const picks = getOptionPicks();
    let v = byKey.get(keyOf(picks));
    if (!v) {
      v =
        variants.find(
          (x) =>
            (picks[0] ? x.option1 === picks[0] : true) &&
            (picks[1] ? x.option2 === picks[1] : true) &&
            (picks[2] ? x.option3 === picks[2] : true)
        ) || variants[0];
    }
    return v;
  }

  function reflectSwatches(v) {
    if (!swatchRoot || !v) return;
    const vals = [v.option1, v.option2, v.option3];
    const groups = [...swatchRoot.querySelectorAll("[data-swatch-group]")];
    groups.forEach((g, idx) => {
      const kind = g.getAttribute("data-kind");
      const val = vals[idx];
      if (!val) return;
      if (kind === "dropdown") {
        const sel = g.querySelector("[data-swatch-select]");
        if (sel) sel.value = val;
      } else {
        g.querySelectorAll("[data-swatch]").forEach((b) => {
          const active = b.getAttribute("data-option-value") === val;
          if (active) b.setAttribute("data-active", "true");
          else b.removeAttribute("data-active");
          b.setAttribute("aria-pressed", active ? "true" : "false");
          b.querySelector("[data-sel-ring]")?.classList.toggle(
            "ring-black",
            active
          );
          b.querySelector("[data-sel-ring]")?.classList.toggle(
            "ring-transparent",
            !active
          );
        });
        const lab = g.querySelector("[data-picked-label]");
        if (lab) lab.textContent = val;
      }
    });
  }

  async function applyVariant(v) {
    if (!v) return;
    if (idField) idField.value = v.id;
    if (selectEl) selectEl.value = String(v.id);
    qtyInput.value = 1;

    updateATC(v);
    updateMessage(v);
    updateUrl(v.id);
    updateSkuBarcode(v);
    updateFeaturedMedia(v);
    updateStockAvailablity(v, availableQuantity);

    try {
      await refreshServerBits(v.id);
    } catch (e) {
      console.log("error", e);
    }
  }

  // Swatch clicks (color/size)
  if (swatchRoot) {
    swatchRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-swatch]");
      if (!btn) return;
      const group = btn.closest("[data-swatch-group]");
      group.querySelectorAll("[data-swatch]").forEach((b) => {
        b.removeAttribute("data-active");
        b.setAttribute("aria-pressed", "false");

        b.querySelector("[data-sel-ring]")?.classList.remove("ring-black");
        b.querySelector("[data-sel-ring]")?.classList.add("ring-transparent");
      });
      btn.setAttribute("data-active", "true");
      btn.setAttribute("aria-pressed", "true");
      btn
        .querySelector("[data-sel-ring]")
        ?.classList.remove("ring-transparent");
      btn.querySelector("[data-sel-ring]")?.classList.add("ring-black");
      const lab = group.querySelector("[data-picked-label]");
      if (lab) lab.textContent = btn.getAttribute("data-option-value") || "";

      const v = findVariantForPicks();
      applyVariant(v);
    });

    // Dropdown option groups
    swatchRoot.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-swatch-select]");
      if (!sel) return;
      const v = findVariantForPicks();
      reflectSwatches(v);
      applyVariant(v);
    });
  }

  // Select fallback (kept for accessibility)
  if (selectEl) {
    selectEl.addEventListener("change", () => {
      const v = byId.get(String(selectEl.value));
      reflectSwatches(v);
      applyVariant(v);
    });
  }

  // Quantity +/-
  function clampQty(n) {
    n = parseInt(n || "1", 10);
    return isNaN(n) || n < 1 ? 1 : n;
  }

  if (minusBtn && qtyInput) {
    minusBtn.addEventListener("click", () => {
      const v = byId.get(String(idField?.value));
      qtyInput.value = Math.max(1, clampQty(qtyInput.value) - 1);
      updateMessage(v);
      updateATC(v);
    });
  }
  if (plusBtn && qtyInput) {
    plusBtn.addEventListener("click", () => {
      const v = byId.get(String(idField?.value));
      const next = clampQty(qtyInput.value) + 1;
      qtyInput.value = next;
      updateMessage(v);
      updateATC(v);
    });
  }
  // Also catch manual typing
  if (qtyInput) {
    ["input", "change"].forEach((evt) =>
      qtyInput.addEventListener(evt, (e) => {
        const v = byId.get(String(idField?.value));
        qtyInput.value = clampQty(e.target.value);
        updateMessage(v);
        updateATC(v);
      })
    );
  }

  // AJAX Add-to-Cart -> show success/error in message block
  const form = root.querySelector("form[data-product-form]");
  if (form) {
    form.addEventListener("submit", async (e) => {
      if (!atcBtn) return; // let it submit normally
      e.preventDefault();
      const variantId = idField?.value;
      const v = byId.get(String(variantId));

      // Only enforce when inventory is tracked AND oversell is denied.
      const isCapped =
        v &&
        v.inventory_management &&
        v.inventory_policy === "deny" &&
        typeof v.inventory_quantity === "number";

      if (isCapped) {
        const inCart = await cartQtyForVariant(variantId);

        // Block ONLY when the cart already has the full available stock.
        if (inCart >= v.inventory_quantity) {
          showMessage(
            "error",
            "You already have the maximum available quantity for this variant in your cart."
          );
          return; // stop: don't call /cart/add.js
        }
      }

      const fd = new FormData(form);
      // Ensure variant id & qty
      if (idField && !fd.get("id")) fd.set("id", idField.value);
      if (qtyInput) fd.set("quantity", qtyInput.value);

      try {
        const res = await fetch("/cart/add.js", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.description || "Add to cart failed");
        showMessage("success", "Product added to cart.");
        // you can emit a custom event here if you have a mini-cart listener
        document.dispatchEvent(new CustomEvent("cart:added", { detail: data }));
      } catch (err) {
        // showMessage("error", String(err.message || err));
      }
    });
  }

  // Initial reflect: prefer ?variant= from URL
  const urlVid = new URL(location.href).searchParams.get("variant");
  const init =
    (urlVid && byId.get(String(urlVid))) ||
    (selectEl && byId.get(String(selectEl.value))) ||
    variants[0];

  if (init) {
    reflectSwatches(init);
    applyVariant(init, { announce: false });
  }
});
