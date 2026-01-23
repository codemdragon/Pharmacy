// Side Menu & Interactives (Event Delegation for Dynamic Content)
document.addEventListener('click', (e) => {
    // Mobile Menu Button
    const menuBtn = e.target.closest('.mobile-menu-btn');
    if (menuBtn) {
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('#overlay');
        if (sideNav && overlay) {
            sideNav.classList.add('open');
            overlay.classList.add('open');
        }
    }

    // Close Button
    const closeBtn = e.target.closest('.close-btn');
    if (closeBtn) {
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('#overlay');
        if (sideNav && overlay) {
            sideNav.classList.remove('open');
            overlay.classList.remove('open');
        }
    }

    // Overlay
    if (e.target.id === 'overlay') {
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('#overlay');
        if (sideNav && overlay) {
            sideNav.classList.remove('open');
            overlay.classList.remove('open');
        }
    }

    // Submenu Toggle
    const submenuToggle = e.target.closest('.submenu-toggle');
    if (submenuToggle) {
        e.preventDefault();
        const navItem = submenuToggle.parentElement;
        if (navItem) {
            navItem.classList.toggle('submenu-open');
        }
    }
});
// Carousel Functionality
const slides = document.querySelectorAll('.carousel-slide');
const dots = document.querySelectorAll('.carousel-dot');
const prevBtn = document.querySelector('.carousel-arrow.prev');
const nextBtn = document.querySelector('.carousel-arrow.next');
let currentSlide = 0;

function showSlide(n) {
    if (slides.length === 0) return;
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    currentSlide = (n + slides.length) % slides.length;

    slides[currentSlide].classList.add('active');
    if (dots.length > 0) {
        dots[currentSlide].classList.add('active');
    }
}

// Auto advance carousel
let slideInterval = setInterval(() => {
    showSlide(currentSlide + 1);
}, 5000);

// Dot click events
if (dots.length > 0) {
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showSlide(index);
            clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                showSlide(currentSlide + 1);
            }, 5000);
        });
    });
}


// Arrow click events
if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        showSlide(currentSlide - 1);
        clearInterval(slideInterval);
        slideInterval = setInterval(() => {
            showSlide(currentSlide + 1);
        }, 5000);
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        showSlide(currentSlide + 1);
        clearInterval(slideInterval);
        slideInterval = setInterval(() => {
            showSlide(currentSlide + 1);
        }, 5000);
    });
}


// Add animation on scroll
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 1s ease forwards';
        }
    });
}, observerOptions);

// Observe service cards and quality section
document.querySelectorAll('.service-card, .quality-content, .subscription-content').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});
