// Universal Page Loader System with Preloading
(function() {
    'use strict';

    // Loader types
    const LOADER_TYPES = {
        SPINNER: 'spinner',      // For individual condition pages
        DOTS: 'dots',            // For detail pages
        PROGRESS: 'progress',    // For main category pages
        FULL: 'full'             // For index/home page
    };

    // Create loader HTML
    function createLoaderHTML(type) {
        const logoHTML = `
            <div class="loader-logo">
                <div class="logo-circle">
                    <i class="fas fa-clinic-medical"></i>
                </div>
                <h3>Guardian Pharmacy</h3>
            </div>
        `;

        let contentHTML = '';
        
        switch(type) {
            case LOADER_TYPES.SPINNER:
                contentHTML = `
                    <div class="modern-spinner">
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                    </div>
                    <div class="loading-message">Loading...</div>
                    <div class="loading-submessage">Please wait while we load your content</div>
                `;
                break;
            case LOADER_TYPES.DOTS:
                contentHTML = `
                    <div class="dot-loader">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                    <div class="loading-message">
                        <span class="message-rotator message-1">Loading your content</span>
                        <span class="message-rotator message-2">Processing your request</span>
                        <span class="message-rotator message-3">Almost ready</span>
                    </div>
                    <div class="loading-submessage">This will only take a moment</div>
                `;
                break;
            case LOADER_TYPES.PROGRESS:
                contentHTML = `
                    <div class="progress-loader">
                        <div class="progress-bar"></div>
                    </div>
                    <div class="loading-message">Loading page content</div>
                    <div class="loading-submessage">Please wait while we gather your information</div>
                `;
                break;
            case LOADER_TYPES.FULL:
                contentHTML = `
                    <div class="modern-spinner">
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                    </div>
                    <div class="dot-loader">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                    <div class="progress-loader">
                        <div class="progress-bar"></div>
                    </div>
                    <div class="loading-message">
                        <span class="message-rotator message-1">Preparing your experience</span>
                        <span class="message-rotator message-2">Loading page elements</span>
                        <span class="message-rotator message-3">Finalizing your request</span>
                    </div>
                    <div class="loading-submessage">Thank you for your patience</div>
                `;
                break;
        }

        return `
            <div class="loader-wrapper">
                ${logoHTML}
                ${contentHTML}
            </div>
        `;
    }

    // Inject loader CSS
    function injectLoaderCSS() {
        if (document.getElementById('universal-loader-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'universal-loader-styles';
        style.textContent = `
            .universal-loading {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(255, 255, 255, 0.98);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 99999;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.4s ease, visibility 0.4s ease;
            }

            .universal-loading.active {
                opacity: 1;
                visibility: visible;
            }

            .loader-wrapper {
                text-align: center;
                padding: 40px;
                max-width: 400px;
            }

            .loader-logo {
                margin-bottom: 30px;
            }

            .logo-circle {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #0056b3, #004494);
                border-radius: 50%;
                margin: 0 auto 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                animation: gentlePulse 2s infinite ease-in-out;
            }

            .logo-circle i {
                color: white;
                font-size: 36px;
            }

            .loader-logo h3 {
                color: #0056b3;
                font-size: 22px;
                font-weight: 600;
                font-family: 'Poppins', sans-serif;
            }

            .modern-spinner {
                width: 70px;
                height: 70px;
                position: relative;
                margin: 0 auto 30px;
            }

            .spinner-ring {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 5px solid transparent;
                border-top-color: #0056b3;
                animation: spin 1.2s linear infinite;
            }

            .spinner-ring:nth-child(2) {
                border-top-color: #007bff;
                animation-delay: -0.4s;
            }

            .spinner-ring:nth-child(3) {
                border-top-color: #4dabf7;
                animation-delay: -0.8s;
            }

            .dot-loader {
                display: flex;
                justify-content: center;
                gap: 12px;
                margin: 30px 0;
            }

            .dot {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background-color: #0056b3;
                animation: dotBounce 1.4s infinite ease-in-out both;
            }

            .dot:nth-child(1) { animation-delay: -0.32s; }
            .dot:nth-child(2) { animation-delay: -0.16s; }
            .dot:nth-child(3) { animation-delay: 0s; }

            .progress-loader {
                width: 300px;
                height: 8px;
                background-color: #e9ecef;
                border-radius: 4px;
                overflow: hidden;
                margin: 30px auto;
            }

            .progress-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #0056b3, #4dabf7);
                border-radius: 4px;
                animation: progressLoad 2s ease-in-out infinite;
            }

            .loading-message {
                color: #0056b3;
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 10px;
                min-height: 27px;
                font-family: 'Poppins', sans-serif;
            }

            .loading-submessage {
                color: #6c757d;
                font-size: 14px;
                max-width: 300px;
                margin: 0 auto;
                font-family: 'Roboto', sans-serif;
            }

            .message-rotator {
                opacity: 0;
                animation: fadeInOut 4s infinite;
            }

            .message-2 {
                animation-delay: 1.33s;
            }

            .message-3 {
                animation-delay: 2.66s;
            }

            @keyframes gentlePulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes dotBounce {
                0%, 80%, 100% { 
                    transform: scale(0);
                    opacity: 0.5;
                }
                40% { 
                    transform: scale(1);
                    opacity: 1;
                }
            }

            @keyframes progressLoad {
                0% { width: 0%; transform: translateX(0); }
                50% { width: 70%; }
                100% { width: 100%; transform: translateX(100%); }
            }

            @keyframes fadeInOut {
                0%, 33%, 100% { opacity: 0; }
                10%, 23% { opacity: 1; }
            }

            @media (max-width: 600px) {
                .progress-loader {
                    width: 250px;
                }
                .loader-wrapper {
                    padding: 20px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Preload resources
    function preloadResources(urls) {
        urls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = url;
            document.head.appendChild(link);
        });
    }

    // Show loader
    function showLoader(type = LOADER_TYPES.SPINNER) {
        let loader = document.getElementById('universal-loader');
        
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'universal-loader';
            loader.className = 'universal-loading';
            document.body.appendChild(loader);
        }
        
        loader.innerHTML = createLoaderHTML(type);
        loader.classList.add('active');
    }

    // Hide loader
    function hideLoader() {
        const loader = document.getElementById('universal-loader');
        if (loader) {
            loader.classList.remove('active');
            setTimeout(() => {
                if (loader && !loader.classList.contains('active')) {
                    loader.innerHTML = '';
                }
            }, 400);
        }
    }

    // Initialize loader on page load
    function initLoader() {
        injectLoaderCSS();
        
        // Determine loader type based on page
        const path = window.location.pathname;
        let loaderType = LOADER_TYPES.SPINNER;
        
        // Main category pages - Progress loader
        if (path.includes('seasonal.html') || path.includes('chronic_conditions.html') || 
            path.includes('wellness.html') || path.includes('general_health.html') ||
            path === '/index.html' || path.endsWith('/') || path.endsWith('/index.html')) {
            loaderType = LOADER_TYPES.PROGRESS;
        }
        // Home page - Full loader
        else if (path === '/index.html' || path.endsWith('/') || path.endsWith('/index.html')) {
            loaderType = LOADER_TYPES.FULL;
        }
        // Detail pages (wellness subpages) - Dots loader
        else if (path.includes('Wellness/') || path.includes('wellness/')) {
            loaderType = LOADER_TYPES.DOTS;
        }
        // Individual condition pages - Spinner loader
        else {
            loaderType = LOADER_TYPES.SPINNER;
        }

        // Show loader immediately
        showLoader(loaderType);

        // Hide when page is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Wait for images and other resources
                window.addEventListener('load', () => {
                    setTimeout(hideLoader, 300);
                });
            });
        } else {
            window.addEventListener('load', () => {
                setTimeout(hideLoader, 300);
            });
        }
    }

    // Preload navigation links on hover
    function setupLinkPreloading() {
        document.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a[href]');
            if (link && link.href && link.href.startsWith(window.location.origin)) {
                const url = link.href;
                const linkEl = document.createElement('link');
                linkEl.rel = 'prefetch';
                linkEl.href = url;
                document.head.appendChild(linkEl);
            }
        }, true);
    }

    // Export API
    window.PageLoader = {
        show: showLoader,
        hide: hideLoader,
        types: LOADER_TYPES,
        preload: preloadResources
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initLoader();
            setupLinkPreloading();
        });
    } else {
        initLoader();
        setupLinkPreloading();
    }
})();
