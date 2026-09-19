(function () {
  'use strict';

  var maintenanceEnabled = window.PLATFORM_MAINTENANCE_MODE === true;
  if (!maintenanceEnabled) return;

  var path = (window.location.pathname || '').toLowerCase();
  var currentPage = path.split('/').pop() || 'index.html';

  // Keep admin access available so administrators can manage the platform
  // while the student-facing production site is under maintenance.
  var adminPages = new Set([
    'admin-dashboard.html',
    'setup-admin.html'
  ]);

  if (adminPages.has(currentPage)) return;
  if (currentPage === 'maintenance.html') return;

  var target = 'maintenance.html';
  var query = window.location.search || '';
  var hash = window.location.hash || '';

  // Preserve the original destination for diagnostics / reopening later.
  // No Firebase call is made here.
  var returnTo = currentPage + query + hash;
  try {
    sessionStorage.setItem('maintenance_return_to', returnTo);
  } catch (e) {
    // Ignore storage restrictions.
  }

  window.location.replace(target);
})();
