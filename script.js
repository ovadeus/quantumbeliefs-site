/**
 * Quantum Beliefs landing page
 *
 * TESTIMONIALS
 * ------------
 * Edit the array below to add, change, or remove praise cards.
 * Each card needs:
 *   quote  — the review text
 *   name   — the person's name
 *   role   — title, affiliation, or short descriptor
 *   photo  — path to a square photo in assets/testimonials/
 *            Leave "" (empty) to use the neutral placeholder avatar.
 *
 * To add a person's photo:
 *   1. Save a square image (at least 400×400, JPG or PNG) as
 *      assets/testimonials/jane-doe.jpg
 *   2. Set photo: "assets/testimonials/jane-doe.jpg"
 *   3. Replace the [PLACEHOLDER: ...] strings with the real quote, name, and role.
 *
 * To add a card, copy one object and append it to the array.
 * To remove a card, delete that object (including its trailing comma if needed).
 *
 * Do not invent reviews. Leave placeholders in place until you have a real quote
 * and the person's permission to use their name and photo.
 */

const PLACEHOLDER_AVATAR = "assets/testimonials/placeholder-avatar.png";

const TESTIMONIALS = [
  {
    quote: "[PLACEHOLDER: reader review]",
    name: "[PLACEHOLDER: Reviewer name]",
    role: "[PLACEHOLDER: Role or title]",
    photo: ""
  },
  {
    quote: "[PLACEHOLDER: reader review]",
    name: "[PLACEHOLDER: Reviewer name]",
    role: "[PLACEHOLDER: Role or title]",
    photo: ""
  },
  {
    quote: "[PLACEHOLDER: reader review]",
    name: "[PLACEHOLDER: Reviewer name]",
    role: "[PLACEHOLDER: Role or title]",
    photo: ""
  }
];

function isPlaceholder(value) {
  return !value || /\[PLACEHOLDER:/i.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTestimonials() {
  const grid = document.getElementById("testimonial-grid");
  if (!grid) return;

  if (!TESTIMONIALS.length) {
    grid.innerHTML =
      '<p class="placeholder-banner">[PLACEHOLDER: reader reviews] No testimonial cards are in the TESTIMONIALS array yet. Add objects in script.js.</p>';
    return;
  }

  grid.innerHTML = TESTIMONIALS.map((item, index) => {
    const quote = item.quote || "[PLACEHOLDER: reader review]";
    const name = item.name || "[PLACEHOLDER: Reviewer name]";
    const role = item.role || "[PLACEHOLDER: Role or title]";
    const photo = item.photo && item.photo.trim() ? item.photo.trim() : PLACEHOLDER_AVATAR;
    const pending = isPlaceholder(quote) || isPlaceholder(name) || isPlaceholder(role) || photo === PLACEHOLDER_AVATAR;
    const quoteClass = isPlaceholder(quote) ? " is-placeholder" : "";
    const nameClass = isPlaceholder(name) ? " is-placeholder" : "";
    const roleClass = isPlaceholder(role) ? " is-placeholder" : "";
    const alt = isPlaceholder(name)
      ? "Neutral placeholder avatar for a forthcoming reviewer photo"
      : "Portrait of " + name;

    return `
      <article class="testimonial-card${pending ? " has-placeholder" : ""}" data-index="${index}">
        <blockquote class="testimonial-quote${quoteClass}">${escapeHtml(quote)}</blockquote>
        <footer class="testimonial-footer">
          <img class="testimonial-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(alt)}" width="72" height="72">
          <div>
            <p class="testimonial-name${nameClass}">${escapeHtml(name)}</p>
            <p class="testimonial-role${roleClass}">${escapeHtml(role)}</p>
          </div>
        </footer>
      </article>
    `;
  }).join("");
}

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", close);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function setupSignupForm() {
  const form = document.getElementById("excerpt-form");
  if (!form) return;
  const status = form.querySelector(".form-status");
  const emailInput = form.querySelector("#signup-email");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = (emailInput && emailInput.value || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (status) {
        status.className = "form-status is-error";
        status.textContent = "Please enter a valid email address.";
      }
      if (emailInput) emailInput.focus();
      return;
    }

    // TODO: connect this form to an email provider (Buttondown, ConvertKit,
    // Mailchimp, Resend, etc.). Do not add API keys, secrets, or a live
    // endpoint in this file. Until a provider is wired, nothing is sent.
    if (status) {
      status.className = "form-status is-todo";
      status.textContent =
        "[PLACEHOLDER: email provider] This form is front-end only and did not send your address. Connect a provider in script.js before publishing.";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderTestimonials();
  setupNav();
  setupSignupForm();
});
