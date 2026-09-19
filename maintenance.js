/*
 * Production maintenance gate.
 *
 * Reads maintenance-config.json with a unique cache-busting query parameter
 * and cache: "no-store" so changing the switch does not require users to
 * disable browser cache or open DevTools.
 *
 * true  = public/student pages redirect to maintenance.html
 * false = normal website operation
 *
 * Admin pages remain accessible while maintenance mode is ON.
 */
(function () {
  'use strict';

  var path = (window.location.pathname || '').toLowerCase();
  var currentPage = path.split('/').pop() || 'index.html';

  var adminPages = new Set([
    'admin-dashboard.html',
    'setup-admin.html'
  ]);

  if (adminPages.has(currentPage) || currentPage === 'maintenance.html') {
    return;
  }

  // Prevent page content from flashing briefly before the maintenance check.
  try {
    document.documentElement.style.visibility = 'hidden';
  } catch (e) {}

  var configUrl = 'maintenance-config.json?_cb=' + Date.now();

  fetch(configUrl, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  })
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Maintenance config HTTP ' + response.status);
      }
      return response.json();
    })
    .then(function (config) {
      var maintenanceEnabled = config && config.maintenance === true;

      if (maintenanceEnabled) {
        var query = window.location.search || '';
        var hash = window.location.hash || '';
        var returnTo = currentPage + query + hash;

        try {
          sessionStorage.setItem('maintenance_return_to', returnTo);
        } catch (e) {}

        window.location.replace('maintenance.html');
        return;
      }

      document.documentElement.style.visibility = '';
    })
    .catch(function (error) {
      // Fail open so a temporary GitHub Pages/config fetch issue does not
      // accidentally block the production platform.
      console.warn('Maintenance check failed; continuing normally.', error);
      document.documentElement.style.visibility = '';
    });
})();
