angular.module('DeviceStatusApp', ['tmCloudClient', 'AuthMixin'], function($provide) {
		$provide.value('endpoint', 'http://http.cloud.tiny-mesh.com:8080');
	})
	.config(['$httpProvider', function($httpProvider) {
		$httpProvider.defaults.timeout = 60000;
	}])
	.filter('address', function() {
		return function(val, opts, bigendian) {
			var buf;
			bigendian = bigendian || false;

			addr = _.filter(("00000000" + parseInt(val, 10).toString(16))
					.substr(-8)
					.split(/(..)/), function(x) { return x !== ''; });
			switch (opts.encoding || "hex") {
				case "hex":
					return (bigendian ? addr : addr.reverse()).join(":");

				case "bytes":
					addr = _.map(addr, function(x) { return parseInt(x, 16); });
					return (bigendian ? addr : addr.reverse()).join('.');

				default:
					return val;
			}
		};
	})
	.controller('DeviceStatusController', function(
		$scope,
		$location,
		$q,
		tmNet,
		tmMsgQuery) {

		$scope.networks = [];
		$scope.network = {};
		$scope.devicemap = [];
		$scope.devicekeys = {};

		$scope.predicate = "address";
		$scope.reverse = false;
		$scope.filterType = $location.$$search.filter;
		$scope.filterStatus = $location.$$search.status;
		$scope.statuses = {
			'all':'All',
			'online': 'Online',
			'offline': 'Offline',
			'unknown':'Unknown'
		};

		$scope.setFilter = function(filter) {
			if ('all' === filter) {
				filter = undefined;
			}

			$location.search('filter', filter);
			$scope.filterType = filter;
		};

		$scope.setStatusFilter = function(filter) {
			if ('all' === filter) {
				filter = undefined;
			}

			$location.search('status', filter);
			$scope.filterStatus = filter;
		};

		$scope.sort = function(predicate) {
			if (predicate === $scope.predicate)
				$scope.reverse = !$scope.reverse;
			else
				$scope.reverse = false;

			$scope.predicate = predicate;
		};

		var pad = function(n, width, z) {
			z = z || '0';
			n = n + '';
			return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
		};

		var dateToDay = function (date) {
			var y = date.getFullYear();
			var feb = y & 4 === 0 && (y % 100 !== 0 || year % 400 === 0) ? 29 : 28;

			var aggregateMonths = [0, // January
								   31, // February
								   31 + feb, // March
								   31 + feb + 31, // April
								   31 + feb + 31 + 30, // May
								   31 + feb + 31 + 30 + 31, // June
								   31 + feb + 31 + 30 + 31 + 30, // July
								   31 + feb + 31 + 30 + 31 + 30 + 31, // August
								   31 + feb + 31 + 30 + 31 + 30 + 31 + 31, // September
								   31 + feb + 31 + 30 + 31 + 30 + 31 + 31 + 30, // October
								   31 + feb + 31 + 30 + 31 + 30 + 31 + 31 + 30 + 31, // November
								   31 + feb + 31 + 30 + 31 + 30 + 31 + 31 + 30 + 31 + 30, // December
								 ];
			return aggregateMonths[date.getMonth()] + date.getDate();
		}

		var aux = {},
			latest = {},
			dates = {};

		$scope.handleResp = function(data) {
			_.each(data.result, function(msg) {
				var idx = $scope.devicekeys[msg.selector[1]];
				if (!aux[idx]) {
					aux[idx] = {};
				}

				var volt = (msg['proto/tm'].aio0 * 1.25/2047)*29.75;
					current = (msg['proto/tm'].aio1 * 1.25/2047);

				aux[idx][msg.datetime] = {
					volt: volt,
					current: current,
				};

				var time = new Date(msg.datetime).getTime();
				if (!latest[idx]) {
					latest[idx] = time;
				}

				if (time > latest[idx]) {
					latest[idx] = time;
				}
			});

			$scope.recalculate(aux, latest);

			$scope.load[0]++;
		};

		var imaint = 5;
		$scope.recalculate = function(data, latest) {
			_.each(latest, function(time, idx) {
				$scope.devicemap[idx].latest = time;

				var threshold = new Date().getTime() - 600000;

				if (time >= threshold) {
					$scope.devicemap[idx].power_status = "online";
				} else if (time < threshold && $scope.devicemap[idx].power_status !== "online") {
					$scope.devicemap[idx].power_status = "offline";
				}
			});

			_.each(data, function(items, idx) {
				var totalwattage = 0,
					lastwattage = 0,
					dailyavg = {},
					imainterval = 5
					previma = null;

				_.each(items, function(item, k) {
					var date = new Date(k);
					day = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
					if (date.getTime() >= latest[idx]) {
						lastwattage = ((item.volt * item.current) / 0.85);
					}

					dailyavg[day] = (dailyavg[day] || 0) + 1;

					totalwattage = (totalwattage + ((item.volt * item.current) / 0.85)) / 2;

					if (previma)
						imainterval = Math.round((date.getTime() - previma) / 60 / 1000)

					previma = date.getTime()
				});


				if (!$scope.devicemap[idx]) { $scope.devicemap[idx] = {}; }

				$scope.devicemap[idx].wattage = Math.round(lastwattage * 10) / 10;
				//$scope.devicemap[idx].wattage = 7;
				$scope.devicemap[idx].totalwattage = totalwattage

				var totalonline;
				if (_.size(items) > 0) {


					totalonline = Math.round((_.size(items) * imaint / 60) * 10) / 10;
					// dailyavg is calculated from a first received msg to
					// today, this means if there are holes in the middle
					// of the data set it will negatively effect the
					// average but missing data at the start of the dataset
					// will not.
					var today = new Date()
					var weeklyAvg = [0,0,0,0,0,0,0]
					_.each(dailyavg, function(v, k) {
						var diff = today.getTime() - (new Date(k)).getTime()
						var days = Math.trunc(diff / 1000 / 86400)
						weeklyAvg[weeklyAvg.length - days] = v
					})

					$scope.devicemap[idx].online = Math.round((_.reduce(weeklyAvg, function(acc, v) {
						return (((0 === acc) ? v : acc) + v) / 2
					}, 0) * imaint / 60) * 10) / 10

					$scope.devicemap[idx].saved = Math.round((totalonline * 53) * 10) / 10;


//					totalonline = Math.round((_.size(items) / (60/imaint)) * 10) / 10;
//					$scope.devicemap[idx].online = _.reduce(dailyavg, function(acc, v) {
//						var dayval = Math.round((v * imaint / 60) * 10) / 10
//						return (acc > 0 ? acc : dayval) + dayval / 2
//					}, 0)
//					//$scope.devicemap[idx].consumption = Math.round((online * totalwattage) * 10) / 10;
//
//
//
				} else {
					$scope.devicemap[idx].online = -1;
				}

				//console.log('avg', $scope.devicemap[idx].key, dailyavg, $scope.devicemap[idx].online, totalonline)


				$scope.devicemap[idx].imainterval = imainterval;


			});
		};

		$scope.loadError = [];
		$scope.load = [0,0];

		$scope.setNetwork = function(network) {
			if (!network) {
				return;
			}

			network.types.all = [];

			$location.search('network', network['key']);
			angular.copy(network, $scope.network);
			$scope.devicemap = [];
			$scope.devicekeys = {};
			_.each(network.devicemap, function(v, k) {
				v.key = k;
				v.power_status = "unknown";
				v.online = 0;
				v.wattage = 0; //7;
				v.consumption = 0;
				v.latest = 0;
				v.saved = 0;
				var length = $scope.devicemap.push(v);
				$scope.devicekeys[v.key] = length - 1;
			});

			var step = 7;
			var now = new Date(),
				since = dateToDay(new Date("2014-07-15"));
			var days = [["NOW//-" + step + "DAY", "NOW//+1DAY"]];
			for (j = 2; j <= Math.ceil((dateToDay(now) - since) / step); j++) {
				days.push(["NOW//-" + j * step + "DAY", "NOW//+" + (j-1)*step + "DAY"])
			}

			$scope.loadError = days;
			$scope.dataload(network.key, days);
		};

		$scope.dataload = function(net, days) {
			$scope.loadError = [];
			$scope.load = [0, days.length];

			_.each(days, function(dates) {
				var from = dates[0],
					to = dates[1];

				var res = tmMsgQuery.query({
					'network': net,
					'device': '',
					'date.from': from,
					'date.to': to,
					'filter.pick': "proto/tm.aio0,proto/tm.aio1",
					'query': 'proto/tm.type:event,proto/tm.detail:ima',
					'sort.by': 'datetime'
				});

				res.$promise.then($scope.handleResp, function(e) {
					$scope.loadError.push([from, to]);
					$scope.load[0]++;
				});
			});

			return false;
		};

		tmNet.list()
			.$promise.then(function(networks) {
				angular.copy(networks, $scope.networks);
				if ($location.$$search.network) {
					$scope.setNetwork(_.where(networks, {key: $location.$$search.network})[0]);
				}
			});
	})
	.filter('fuzzyDate', function() {
		/*
		 * JavaScript Pretty Date
		 * Copyright (c) 2011 John Resig (ejohn.org)
		 * Licensed under the MIT and GPL licenses.
		 */

		// Takes an ISO time and returns a string representing how
		// long ago the date represents.
		return function(time){
			var date = new Date((time || "")),
				diff = (((new Date()).getTime() - date.getTime()) / 1000),
				day_diff = Math.floor(diff / 86400);

			if ( isNaN(day_diff) || day_diff < 0 || day_diff >= 31 ) {
				return undefined;
			}

			return day_diff === 0 && (
					diff < 60 && "just now" ||
					diff < 240 && "few minutes ago" ||
					diff < 3600 && Math.floor( diff / 60 ) + " minutes ago" ||
					diff < 7200 && "1 hour ago" ||
					diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
				day_diff === 1 && "Yesterday" ||
				day_diff < 7 && day_diff + " days ago" ||
				day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
				day_diff < 365 && Math.ceil( day_diff / 31 ) + " months ago" ||
				day_diff > 365 && Math.ceil( day_diff / 365 ) + " years ago";
		};
	});
