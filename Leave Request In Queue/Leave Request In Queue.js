tau.mashups
	.addDependency('app.path')
	.addDependency('tau/core/global.bus')
	.addDependency('tau/configurator')
	.addMashup(
		function (appPath, gb, c, config) {
			var store;
			var typeById = {};
			if (!store) {
				store = c.getStore();
			}
			gb.get().on('beforeInit', function (e) {
				if (e.data.config && e.data.config.entity && !typeById[e.data.config.entity.id]) {
					for (var prop in typeById) {
						if (typeById.hasOwnProperty(prop))
							delete typeById[prop];
					}
					typeById[e.data.config.entity.id] = e.data.config.entity.type;
				}
			});

			var requestAddCommentHook = function (placeholder) {
				this.theOptions = {
					question: 'Leave Request in Queue?',
					yesAnswer: ' Leave ',
					cancelAnswer: 'Remove, as usual'
				};
				this.skipedTypes = ['Idea'];
				this.requestViewUrl = appPath.get() + '/Project/HelpDesk/Request/View.aspx';
				this.soapCommentUrl = (appPath.get() + '/Services/CommentsControl.asmx/Create').replace(location.protocol + '//' + location.host, '');
				this.restCommentUrl = appPath.get() + '/api/v1/comments.asmx/?';
				this.placeholder = placeholder;
			}

			requestAddCommentHook.prototype = {
				placeholder: null,
				render: function () {
					this._ctor();
				},
				_ctor: function () {
				},
				_isRestCommentCreatedForRequest: function (jqXHROptions, d) {
					if (jqXHROptions.url && jqXHROptions.url.indexOf(this.restCommentUrl) === 0) {
						d = d || JSON.parse(jqXHROptions.data);
						return d.general && (typeById[d.general.id] === 'request' || location.hash && location.hash.indexOf('#request/' + d.general.id) === 0);
					}
					return false;
				},
				_isSoapCommentCreatedForRequest: function (jqXHROptions, d) {
					if (jqXHROptions.url && jqXHROptions.url.indexOf(this.soapCommentUrl) === 0 && (location.protocol + '//' + location.host + location.pathname).indexOf(this.requestViewUrl) === 0) {
						d = d || JSON.parse(jqXHROptions.data);
						return d.comment && location.search.indexOf('RequestID=' + d.comment.GeneralID) > 0;
					}
					return false;
				}
			}

			var r = new requestAddCommentHook($('#' + config.placeholderId));
			$.ajaxTransport('+', $.proxy(function (options, originalOptions, jqXHR) {
				if (options.postponed === true) {
					var questionHolder, isRestComment, isSoapComment, d = JSON.parse(options.data);
					if (isRestComment = this._isRestCommentCreatedForRequest(options, d)) {
						questionHolder = $($('div.updating')[0]).children('div.ui-comment-body');
					} else if (isSoapComment = this._isSoapCommentCreatedForRequest(options)) {
						questionHolder = d.comment.ParentID ? $('button:contains("Reply").ui-add-comment') : $('button:contains("Comment").ui-add-comment');
					}
					if (questionHolder && questionHolder.length === 1) {
						var successCallback, errorCallback, showQuestion = $.proxy(function (q) {
							if (q.next('.tau-bubble').length <= 0) {
								var opt = this.theOptions;
								q.after('<div class="tau-bubble" style="z-index: 1; display: block;">' +
									'<div class="tau-bubble__inner" style="margin: -2px 1px -2px 1px !important;"><div style="padding: 10px;"><p style="margin:0px !important">' + opt.question +
									'</p><div class="button-group"><button class="button primary" type="button">' + opt.yesAnswer +
									'</button><button class="button" type="button">' + opt.cancelAnswer + '</button></div></div></div>' +
									'<div class="tau-bubble__arrow" data-orientation="bottom" style="display: block;"></div></div>');
								var b = q.next('.tau-bubble');
								var placeholder = $(this.placeholder);
								var f = $.proxy(function (e, xhr, settings) {
									if (settings.isRequestNotReplied != null && settings.isRequestNotReplied === true) {
										placeholder.off('ajaxSuccess', f);
										var generalId, d = JSON.parse(settings.data);
										if (this._isRestCommentCreatedForRequest(settings, d)) {
											generalId = d.general.id;
										} else if (this._isSoapCommentCreatedForRequest(settings, d)) {
											generalId = d.comment.GeneralID;
										}
										$.ajax({
											url: appPath.get() + '/api/v1/Requests/' + generalId,
											data: JSON.stringify({ IsReplied: false }),
											headers: { 'Content-Type': 'application/json' },
											success: function () { },
											error: function () { },
											dataType: 'json',
											type: 'POST'
										});
									}
								}, this);
								if (isRestComment) {
									var c = $('div.ui-all-comments');
									if (c.children().length === 1) {
										var h = c.height();
										c.height(b.height() + h);
										questionHolder.css('top', h + 10);
									}
								}
								var p = q.position();
								b.css('top', (p.top - b.height() - ((isRestComment && d.parentId) ? $('div.ui-richeditor').height() : 0)) + 'px').css('left', p.left + 'px');
								b.find('button').bind('click', $.proxy(function (e) {
									options.postponed = false;
									options.isRequestNotReplied = $(e.target).is('.primary');
									if (options.isRequestNotReplied === true) {
										placeholder.ajaxSuccess(f);
									}
									$.ajax(options).success(successCallback).error(errorCallback);
									this.fadeOut(300, function () {
										$(this).remove();
									})
								}, b));
								q.next('.tau-bubble').css('visibility', 'visible').animate({ opacity: 1 }, 300);
							}
						}, this);
						if (isRestComment) {
							store.evictProperties(d.general.id, 'request', ['requestType']);
							store.get('request', { id: d.general.id, fields: [{ 'requestType': ['id', 'name'] }] }, {
								success: function (res) {
									if ($.inArray(res.data.requestType.name, r.skipedTypes) === -1) {
										showQuestion($(questionHolder[0]));
									}
									else {
										options.postponed = false;
										$.ajax(options).success(successCallback).error(errorCallback);
									}
								}
							}).done();
						} else if (isSoapComment) {
							showQuestion($(questionHolder[0]));
						}
						jqXHR.success = function (callback) {
							if (options.postponed) {
								successCallback = callback;
								return this;
							} else {
								$.ajax(options).success(callback);
							}
						};
						jqXHR.error = function (callback) {
							if (options.postponed) {
								errorCallback = callback;
								return this;
							} else {
								$.ajax(options).error(callback);
							}
						};
						return {
							send: function () { },
							abort: function () { }
						}
					}
				}
			}, r));

			$.ajaxPrefilter('json', $.proxy(function (options, originalOptions, jqXHR) {
				if (options.data && options.isRequestNotReplied == null && options.hasOwnProperty('postponed') === false) {
					if (this._isRestCommentCreatedForRequest(options)) {
						options.postponed = true;
					} else if (this._isSoapCommentCreatedForRequest(options)) {
						options.postponed = true;
					}
				}
			}, r));

			r.render();
		});