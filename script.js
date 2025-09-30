
document.addEventListener('DOMContentLoaded', function() {

    // ======================= IMAGE CAROUSEL LOGIC =======================
    const carouselContainer = document.querySelector('.carousel-container');
    const slides = document.querySelectorAll('.carousel-slide');
    const prevButton = document.querySelector('.carousel-arrow.prev');
    const nextButton = document.querySelector('.carousel-arrow.next');
    
    let currentIndex = 0;
    const slideCount = slides.length;
    const slideInterval = 6000; // Time per slide in milliseconds (6 seconds)
    let autoPlayInterval;

    function goToSlide(index) {
        if (index < 0) {
            index = slideCount - 1;
        } else if (index >= slideCount) {
            index = 0;
        }
        carouselContainer.style.transform = `translateX(-${index * 100}%)`;
        currentIndex = index;
    }

    function nextSlide() {
        goToSlide(currentIndex + 1);
    }

    function prevSlide() {
        goToSlide(currentIndex - 1);
    }

    // Event Listeners for arrows
    nextButton.addEventListener('click', () => {
        nextSlide();
        resetAutoPlay();
    });

    prevButton.addEventListener('click', () => {
        prevSlide();
        resetAutoPlay();
    });

    // Autoplay functionality
    function startAutoPlay() {
        autoPlayInterval = setInterval(nextSlide, slideInterval);
    }

    function resetAutoPlay() {
        clearInterval(autoPlayInterval);
        startAutoPlay();
    }
    
    // Pause on hover
    document.querySelector('.hero-carousel').addEventListener('mouseenter', () => clearInterval(autoPlayInterval));
    document.querySelector('.hero-carousel').addEventListener('mouseleave', () => startAutoPlay());

    // Initialize
    goToSlide(0);
    startAutoPlay();

    // ======================= MOBILE NAVIGATION =======================
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const mobileNav = document.getElementById('mobile-nav');
    const closeBtn = document.getElementById('close-btn');

    hamburgerMenu.addEventListener('click', () => {
        mobileNav.classList.add('is-active');
    });

    closeBtn.addEventListener('click', () => {
        mobileNav.classList.remove('is-active');
    });

    // Close mobile menu when a link is clicked (optional)
    mobileNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileNav.classList.remove('is-active');
        });
    });


    // ======================= SCROLL ANIMATIONS =======================
    // Uses the Intersection Observer API for better performance
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // Optional: Stop observing after it becomes visible
                // observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1 // Trigger when 10% of the element is visible
    });

    animatedElements.forEach(element => {
        observer.observe(element);
    });

});
