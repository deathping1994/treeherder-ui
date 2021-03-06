/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

perf.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.deferIntercept(); // so we don't reload on url change

  $stateProvider.state('graphs', {
    templateUrl: 'partials/perf/perfctrl.html',
    url: '/graphs?timerange&series&highlightedRevision&zoom',
    controller: 'GraphsCtrl'
  }).state('compare', {
    templateUrl: 'partials/perf/comparectrl.html',
    url: '/compare?originalProject&originalRevision&newProject&newRevision&hideMinorChanges&e10s',
    controller: 'CompareResultsCtrl'
  }).state('comparesubtest', {
    templateUrl: 'partials/perf/comparesubtestctrl.html',
    url: '/comparesubtest?originalProject&originalRevision&newProject&newRevision&originalSignature&newSignature&hideMinorChanges',
    controller: 'CompareSubtestResultsCtrl'
  }).state('comparechooser', {
    templateUrl: 'partials/perf/comparechooserctrl.html',
    url: '/comparechooser',
    controller: 'CompareChooserCtrl'
  });

  $urlRouterProvider.otherwise('/graphs');
})
  // define the interception
  .run(function ($rootScope, $urlRouter, $location, $state) {
    $rootScope.$on('$locationChangeSuccess', function(e, newUrl, oldUrl) {
      // Prevent $urlRouter's default handler from firing
      e.preventDefault();

      // if we're not in graphs, or we're viewing the graphs for for first
      // time, synchronize (for graphs we want to be able to update the
      // url without reloading the controller)
      if ($state.current.name !== 'graphs' ||
          newUrl.indexOf('graphs') === -1) {
        $urlRouter.sync();
      }
    });

    // Configures $urlRouter's listener *after* custom listener
    $urlRouter.listen();
  })


