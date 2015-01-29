angular.module('AuthMixin', ['ngRoute', 'ngStorage'])
	.controller('AuthController', function(
		$rootScope,
		$scope,
		$q,
		$localStorage,
		$location,
		$route,
		tmUser,
		tmAuthSession
	) {
		var authpromise = $q.defer();
		$scope.user = new tmUser();
		$scope.auth = false;
		$scope.logout = function() {
			tmAuthSession.logout().then(function() {
				$location.path("#/");
			});
		};

		$rootScope.$on('session:new', function(ev, auth) {
			$scope.auth = auth;
			$scope.user.$get().then(function() {
				return authpromise.resolve();
			});
		});
		$rootScope.$on('session:destroy', function(ev, auth) {
			$scope.auth = false;
		});

		// Call the web service to see if we previously authenticated
		tmAuthSession.maybeAuthenticate(null, function() {
			$localStorage.authenticated = false;
			$location.path("#/");
		});
	})
	.controller('LoginController', function(
		$rootScope,
		$scope,
		$location,
		tmAuthSession
	) {
		if (tmAuthSession.authenticated() && '/auth/login' === $location.path()) {
			$location.path('#/');
		}

		$scope.login = function(user, password) {
			$scope.authError = false;
			tmAuthSession.login(user, password)
				.then(function(resp) {
				}, function(err) {
					$scope.authError = true;
				});
		};
	});
