/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var perf = angular.module("perf", ['ui.router', 'ui.bootstrap', 'treeherder']);

perf.factory('PhSeries', ['$http', 'thServiceDomain', function($http, thServiceDomain) {

  var _getSeriesSummary = function(signature, signatureProps, optionCollectionMap) {
      var platform = signatureProps.machine_platform + " " +
        signatureProps.machine_architecture;
      var e10s = (signatureProps.job_group_symbol === "T-e10s");
      var testName = signatureProps.test;
      var subtestSignatures;
      if (testName === undefined) {
        testName = "summary";
        subtestSignatures = signatureProps.subtest_signatures;
      }
      var name = signatureProps.suite + " " + testName;
      var options = [ optionCollectionMap[signatureProps.option_collection_hash] ];
      if (e10s) {
        options.push("e10s");
      }
      name = name + " " + options.join(" ");

      return { name: name, signature: signature, platform: platform,
               options: options, subtestSignatures: subtestSignatures };
  };

  var _getAllSeries = function(projectName, timeRange, optionMap) {
    var signatureURL = thServiceDomain + '/api/project/' + projectName + 
      '/performance-data/0/get_performance_series_summary/?interval=' +
      timeRange;

    return $http.get(signatureURL).then(function(response) {
      var seriesList = [];
      var platformList = [];
      var testList = [];

      Object.keys(response.data).forEach(function(signature) {
        var seriesSummary = _getSeriesSummary(signature,
                                             response.data[signature],
                                             optionMap);

        seriesList.push(seriesSummary);

        // add test/platform to lists if not yet present
        if (!_.contains(platformList, seriesSummary.platform)) {
          platformList.push(seriesSummary.platform);
        }
        if (!_.contains(testList, seriesSummary.name)) {
          testList.push(seriesSummary.name);
        }
      });

      return {
        seriesList: seriesList,
        platformList: platformList,
        testList: testList
      };
    });
  };

  return {
    getSeriesSummary: function(signature, signatureProps, optionCollectionMap) {
      return _getSeriesSummary(signature, signatureProps, optionCollectionMap);
    },

    getSubtestSummaries: function(projectName, timeRange, optionMap, targetSignature) {
      return _getAllSeries(projectName, timeRange, optionMap).then(function(lists) {
        var seriesList = [];
        var platformList = [];
        var subtestSignatures = [];
        var suiteName;

        //Given a signature, find the series and get subtest signatures
        var seriesSummary = _.find(lists.seriesList,
          function(series) {
            return series.signature == targetSignature;
          });

        if (seriesSummary) {
          subtestSignatures = seriesSummary.subtestSignatures;
          suiteName = seriesSummary.name;
        }

        //For each subtest, find the matching series in the list and store it
        subtestSignatures.forEach(function(signature) {
          var seriesSubtest = _.find(lists.seriesList, function(series) {
                                      return series.signature == signature
                                    });
          seriesList.push(seriesSubtest);

          // add platform to lists if not yet present
          if (!_.contains(platformList, seriesSubtest.platform)) {
            platformList.push(seriesSubtest.platform);
          }
        });

        var testList = [];
        if (suiteName) {
          testList = [suiteName];
        }

        return {
          seriesList: seriesList,
          platformList: platformList,
          testList: testList
        };
      });
    },

    getAllSeries: function(projectName, timeRange, optionMap) {
      return _getAllSeries(projectName, timeRange, optionMap);
    },

    getSeriesSummaries: function(projectName, timeRange, optionMap, userOptions) {
      var seriesList = [];
      var platformList = [];
      var testList = [];

      return _getAllSeries(projectName, timeRange, optionMap).then(function(lists) {
        lists.seriesList.forEach(function(seriesSummary) {
          // Only keep summary signatures, filter in/out e10s

          if (!seriesSummary.subtestSignatures ||
              (userOptions.e10s && !_.contains(seriesSummary.options, 'e10s')) ||
              (!userOptions.e10s && _.contains(seriesSummary.options, 'e10s'))) {
              return;
          } else {
            // We don't generate number for tp5n, this is xperf and we collect counters
            if (_.contains(seriesSummary.name, "tp5n"))
              return

            seriesList.push(seriesSummary);

            // add test/platform to lists if not yet present
            if (!_.contains(platformList, seriesSummary.platform)) {
              platformList.push(seriesSummary.platform);
            }
            if (!_.contains(testList, seriesSummary.name)) {
              testList.push(seriesSummary.name);
            }
          } //if/else
        }); //lists.serieslist.forEach

        return {
          seriesList: seriesList,
          platformList: platformList,
          testList: testList
        };
      }); //_getAllSeries
    },

  }
  }]);

perf.factory('isReverseTest', [ function() {
  return function(testName) {
    var reverseTests = ['dromaeo_dom', 'dromaeo_css', 'v8_7', 'canvasmark'];
    var found = false;
    reverseTests.forEach(function(rt) {
      if (testName.indexOf(rt) >= 0) {
        found = true;
      }
    });
    return found;
  }
}]);


perf.factory('PhCompare', [ '$q', '$http', 'thServiceDomain', 'PhSeries',
             'math', 'isReverseTest', 'phTimeRanges',
  function($q, $http, thServiceDomain, PhSeries, math, isReverseTest, phTimeRanges) {
  var getClassName = function(baselineMin, baselineMax, baselineAvg, currentAvg, test) {
    var range = math.trimFloat((baselineMax - baselineMin) / 2);
    if (isReverseTest(test)) {
      if (currentAvg < baselineAvg - range) {
        if (currentAvg < baselineMin) {
          return "compare-regression";
        }
        // Still more than the min value we got out of the baseline, so we could
        // be OK still, but there could be a regression here too.
        return "compare-notsure";
      }
      else if (currentAvg > baselineMax) {
        return "compare-improvement";
      }
      return "";
    }

    // We have a 'smaller is better' test.
    if (currentAvg > baselineAvg + range) {
      if (currentAvg > baselineMax) {
        return "compare-regression";
      }
      // Still less than the max value we got out of the baseline, so we could be
      // OK still, but there could be a regression here.
      return "compare-notsure";
    }
    else if (currentAvg < baselineMin) {
      return "compare-improvement";
    }
    return "";
  };

  return {
    getCompareClasses: function(cr, type) {
      if (cr.hideMinorChanges && cr.isMinor) return 'subtest-empty';
      if (cr.isEmpty) return 'subtest-empty';
      if (type == 'row') return '';
      if (type == 'bar' && cr.isRegression) return 'bar-regression';
      if (type == 'bar' && cr.isImprovement) return 'bar-improvement';
      if (type == 'bar') return '';
      return cr.className;
    },

    getCounterMap: function(testName, originalData, newData) {
      var cmap = {originalGeoMean: 0, originalRuns: 0, originalStddev: 0,
                  newGeoMean: 0, newRuns: 0, newStddev: 0, delta: 0,
                  deltaPercentage: 0, barGraphMargin: 0, isEmpty: false,
                  isRegression: false, isImprovement: false, isMinor: true};

      if (originalData) {
         cmap.originalGeoMean = originalData.geomean;
         cmap.originalRuns = originalData.runs;
         cmap.originalStddev = originalData.stddev;
         cmap.originalStddevPct = ((originalData.stddev / originalData.geomean) * 100);
         cmap.originalMin = originalData.minVal;
         cmap.originalMax = originalData.maxVal;
      }
      if (newData) {
         cmap.newGeoMean = newData.geomean;
         cmap.newRuns = newData.runs;
         cmap.newStddev = newData.stddev;
         cmap.newStddevPct = ((newData.stddev / newData.geomean) * 100);
         cmap.newMin = newData.minVal;
         cmap.newMax = newData.maxVal;
      }

      if (cmap.originalRuns == 0 && cmap.newRuns == 0) {
        cmap.isEmpty = true;
      } else if (cmap.newGeoMean > 0 && cmap.originalGeoMean > 0) {
        cmap.delta = (cmap.newGeoMean - cmap.originalGeoMean);
        cmap.deltaPercentage = (cmap.delta / cmap.originalGeoMean * 100);
        cmap.barGraphMargin = 50 - Math.min(50, Math.abs(Math.round(cmap.deltaPercentage) / 2));

        cmap.marginDirection = 'right';
        if (cmap.deltaPercentage > 0) {
          cmap.marginDirection = 'left';
        }
        if (isReverseTest(testName)) {
         if (cmap.marginDirection == 'left') {
            cmap.marginDirection = 'right';
          } else {
            cmap.marginDirection = 'left';
          }
        }

        cmap.className = getClassName(cmap.originalMin, cmap.originalMax, cmap.originalGeoMean, cmap.newGeoMean, testName);
        cmap.isRegression = (cmap.className == 'compare-regression');
        cmap.isImprovement = (cmap.className == 'compare-improvement');
        cmap.isMinor = (cmap.className == "");
      }
      return cmap;
    },

    getInterval: function(oldTimestamp, newTimestamp) {
      var now = (new Date()).getTime() / 1000;
      var timeRange = Math.min(oldTimestamp, newTimestamp);
      timeRange = Math.round(now - timeRange);

      //now figure out which predefined set of data we can query from
      var timeRange = _.find(phTimeRanges, function(i) { return timeRange <= i.value });
      return timeRange.value;
    },

    validateInput: function(originalProject, newProject,
                            originalRevision, newRevision,
                            originalSignature, newSignature) {

      var errors = [];
      if (!originalProject) errors.push('Missing input: originalProject');
      if (!newProject) errors.push('Missing input: newProject');
      if (!originalRevision) errors.push('Missing input: originalRevision');
      if (!newRevision) errors.push('Missing input: newRevision');

      if (originalSignature && newSignature) {
        if (!originalSignature) errors.push('Missing input: originalSignature');
        if (!newSignature) errors.push('Missing input: newSignature');
      }

      $http.get(thServiceDomain + '/api/repository/').then(function(response) {
        if (!_.find(response.data, {'name': originalProject}))
          errors.push("Invalid project, doesn't exist: " + originalProject);

        if (!_.find(response.data, {'name': newProject}))
          errors.push("Invalid project, doesn't exist: " + newProject);
      });
      return errors;
    },

    getResultsMap: function(projectName, seriesList, timeRange, resultSetIds) {
      var baseURL = thServiceDomain + '/api/project/' +
        projectName + '/performance-data/0/' +
        'get_performance_data/?interval_seconds=' + timeRange;

      var resultsMap = {};
      return $q.all(_.chunk(seriesList, 20).map(function(seriesChunk) {
        var signatures = "";
        seriesChunk.forEach(function(series) {
            signatures += "&signatures=" + series.signature;
        });
        return $http.get(baseURL + signatures).then(
          function(response) {
            resultSetIds.forEach(function(resultSetId) {
              if (resultsMap[resultSetId] === undefined) {
                resultsMap[resultSetId] = {};
              }
              response.data.forEach(function(data) {
                var means = [];
                _.where(data.blob, { result_set_id: resultSetId }).forEach(function(pdata) {
                  //summary series have geomean, individual pages have mean
                  if (pdata.geomean === undefined) {
                    means.push(pdata.mean);
                  } else {
                    means.push(pdata.geomean);
                  }
                });

                var seriesData = _.find(seriesChunk, {'signature': data.series_signature});

                var total = _.reduce(means, function(mean, total) { return total + mean; })
                var avg = total / means.length;
                var sigma = math.stddev(means, avg);

                resultsMap[resultSetId][data.series_signature] = {geomean: avg,
                                               minVal: Math.min.apply(Math, means),
                                               maxVal: Math.max.apply(Math, means),
                                               stddev: sigma,
                                               runs: means.length,
                                               name: seriesData.name,
                                               platform: seriesData.platform};
              });
            });
          })
      })).then(function() {
        return resultsMap;
      });
    },
  };
}]);


perf.factory('math', [ function() {
  return {
    /**
     * Compute the standard deviation for an array of values.
     *
     * @param values
     *        An array of numbers.
     * @param avg
     *        Average of the values.
     * @return a number (the standard deviation)
     */
    stddev: function(values, avg) {
      if (values.length <= 1) {
        return 0;
      }

      return Math.sqrt(
        values.map(function (v) { return Math.pow(v - avg, 2); })
          .reduce(function (a, b) { return a + b; }) / (values.length - 1));
    },

    trimFloat: function(number) {
      if (number === undefined)
        return 'N/A';
      return Math.round(number * 100) / 100;
    }
  };
}]);


perf.filter('displayPrecision', function() {
  return function(input) {
    if (!input) {
      return "N/A";
    }

    return parseFloat(input).toFixed(2);
  };
});
