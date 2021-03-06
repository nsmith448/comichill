ko.bindingHandlers.cframeSrc = {
    update: function(element, valueAccessor, allBindingsAccessor) {
        // First get the latest data that we're bound to
        var value = valueAccessor(), allBindings = allBindingsAccessor();
         
        // Next, whether or not the supplied model property is observable, get its current value
        var valueUnwrapped = ko.utils.unwrapObservable(value); 
        
        // Now manipulate the DOM element
        if (allowChange) { // hack to stop from updating incorrectly
        	element.contentWindow.location.replace(valueUnwrapped)
        }
    }
};

ko.bindingHandlers.fadeVisible = {
	    update: function(element, valueAccessor, allBindingsAccessor) {
	        // First get the latest data that we're bound to
	        var value = valueAccessor(), allBindings = allBindingsAccessor();
	         
	        // Next, whether or not the supplied model property is observable, get its current value
	        var valueUnwrapped = ko.utils.unwrapObservable(value); 
	        
	        // Now manipulate the DOM element
	        if (valueUnwrapped)
	        	$(element).fadeIn(500);
	        else
	        	$(element).fadeOut(500);
	    }
};

ko.bindingHandlers.viewerCtlVisible = {
	    update: function(element, valueAccessor, allBindingsAccessor) {
	        var value = valueAccessor(), allBindings = allBindingsAccessor();
	        var valueUnwrapped = ko.utils.unwrapObservable(value); 
	        console.log("received: " + valueUnwrapped);
	        if (valueUnwrapped)	    $(element).stop(true,true).show("drop", {direction: 'down'}, 250);
	        else	        		$(element).stop(true,true).hide("drop", {direction: 'down'}, 250);
	    }
};

var queue = Array();
var comics = Array();
var qdir=1;
var allowChange = true;
var subs = null;

function Frame() {
	var self = this;
	self.data = new Strip();
	self.visible = ko.observable(true);
}

function AppViewModel() {
	var self = this;
	self.showCtl = ko.observable(false);
	self.q = ko.observable(0);
	self.qlen = ko.observable(0);
	self.f1 = new Frame();
	self.f2 = new Frame();
	self.cur = self.f1;
	self.off = self.f2;
	self.off.visible(false);
	self.preloadStrip = function(qpos) {
		if (qpos >= 0 && qpos < self.qlen()) {
			var data = queue[qpos];
			ko.mapping.fromJS(data, self.off.data.data);
			ko.mapping.fromJS(comics[data.cid], self.off.data.comic);
		} else {
			qdir = -qdir;
		}
	};
	self.changeStrip = function() {
		if (queue[self.q()].id != self.off.data.data.id())
			self.preloadStrip(self.q());
		
		self.switchFrames();
		if (loggedIn) {
			server_get("visit", {id: self.cur.data.data.id()});
			if (subs && subs[self.cur.data.data.cid()]) {
				var sub = subs[self.cur.data.data.cid()];
				setZoom(sub['zoom']);
			}
		}
		var title = self.cur.data.comic.title()+' - '+self.cur.data.data.title();
		window.history.replaceState({strip: ko.mapping.toJSON(self.cur.data.data), q: self.q()}, title, '/'+(useQueue? "queue" : "comics")+'/'+self.cur.data.comic.label()+'/'+self.cur.data.data.sid());
		document.title = title;
	};
	self.switchFrames = function() {
		allowChange = false;
		self.cur.visible(false);
		self.off.visible(true);
		allowChange = true;
		var tmp = self.cur;
		self.cur = self.off;
		self.off = tmp;
		window.setTimeout("viewModel.preloadStrip(viewModel.q()+qdir);", 500);
	}
	self.init = function(stripData, comicData) {
		ko.mapping.fromJS(stripData, self.cur.data.data);
		ko.mapping.fromJS(comicData, self.cur.data.comic);
		loadSubscriptions(false, function(data) {
			subs = data;
			if (subs[self.cur.data.data.cid()]) {
				var sub = subs[self.cur.data.data.cid()];
				setZoom(sub['zoom']);
			}
		});
		
		// Apply HTML5 history API JS bindings
		if (window.history.pushState) {
			var title = self.cur.data.comic.label()+' - '+self.cur.data.data.sid();
			window.history.replaceState({strip: ko.mapping.toJSON(self.cur.data.data)}, title);
			server_get((useQueue? "queue" : "noqueue"), {'id': self.cur.data.data.id()},
					function(data) {
						queue = data[0];
						comics = data[1];
						viewModel.q(data[2]);
						viewModel.qlen(data[3]);
						if (self.q()+qdir > 0 && self.q()+qdir < self.qlen()) self.preloadStrip(self.q()+qdir);
						$('a#nav-next').bind('click', function(e) { qdir=1; viewModel.q(viewModel.q()+1); viewModel.changeStrip(); e.preventDefault(); });
						$('a#nav-prev').bind('click', function(e) { qdir=-1; viewModel.q(viewModel.q()-1); viewModel.changeStrip(); e.preventDefault(); });
						$('a#nav-next').attr('data-bind', "visible: q() < qlen()-1");
						$('a#nav-prev').attr('data-bind', "visible: q() > 0");
						$('.nav-disabled').removeClass('nav-disabled');
						ko.applyBindings(self);
					});
		}
	};
}
var viewModel = new AppViewModel();
ko.applyBindings(viewModel);

function showSeek() {
	// Do not let the seek window pop up if it is not ready or is already shown
	if (viewModel.qlen() == 0) {
		window.setTimeout("showSeek()", 100);
		return;
	} else if ($("#seekWindow").size() != 0) {
		return;
	}
	
	var seekwin = document.createElement('div');
	var shadow = document.createElement('div');
	$(seekwin).attr('id', 'seekWindow');
	$(shadow).attr('id', 'shadow');
	$(shadow).bind('click', hideSeek);
	
	var seeklist = document.createElement('ul');
	$(seeklist).attr('id', 'seekList');
	
	for (var idx in queue) {
		var strip = queue[idx];
		var item = document.createElement('li');
		$(item).attr('q', idx);
		if (idx == viewModel.q()) $(item).attr('id', 'strip-current');
		$(item).html(comics[strip.cid].label + ' - ' + strip.sid + "&nbsp;&nbsp;-&nbsp;&nbsp;" + strip.title);
		$(item).bind('click', seekFromList);
		$(seeklist).append(item);
	}
	
	$(seekwin).append(seeklist);
	$('body').append(shadow);
	$('#shadow').fadeIn(250);
	$('body').append(seekwin);
}

function seekFromList() {
	seekTo(Number($(this).attr('q')));
}

function seekTo(id) {
	viewModel.q(id);
	viewModel.changeStrip();
	hideSeek();
}

function hideSeek() {
	$('#shadow').fadeOut(250, function () { $('#shadow').remove(); });
	$('#seekWindow').remove();
}

function setZoom(scale) {
	var frameId = (viewModel.cur == viewModel.f1) ? "#cframe1" : "#cframe2";
	$(frameId).css({
		"zoom": scale,
		"-moz-transform": "scale("+scale+")",
		"-webkit-transform": "scale("+scale+")",
		"-o-transform": "scale("+scale+")",
		"-ms-transform": "scale("+scale+")",
		"height": (100/scale)+"%",
		"width": (100/scale)+"%"
	});
}

function applyZoom(scale) {
	var frameId = (viewModel.cur == viewModel.f1) ? "#cframe1" : "#cframe2";
	$(frameId).animate({
		"zoom": scale
	},{"step": function(now, fx) {
		$(fx.elem).css(
				{	"-moz-transform": "scale("+now+")",
					"-webkit-transform": "scale("+now+")",
					"-o-transform": "scale("+now+")",
					"-ms-transform": "scale("+now+")",
					"height": (100/now)+"%",
					"width": (100/now)+"%"
				});
	}});
}

function zoom(scale) {
	applyZoom(scale);
	server_get('zoom', {cid: viewModel.cur.data.comic.id(), scale: scale}, function(data) { loadSubscriptions(true, function(data) { subs = data; } )});
}

function zoomBy(change) {
	var scale = 1.0;
	if (subs[viewModel.cur.data.data.cid()]) {
		var sub = subs[viewModel.cur.data.data.cid()];
		scale = sub['zoom'];
	}
	scale += change;
	
	if (scale < .5) { myAlert("You can't zoom out that much, get a bigger monitor."); return; }
	if (scale > 2) { myAlert("You can't zoom in that much, this isn't CSI."); return; }
	
	applyZoom(scale);
	server_get('zoom', {cid: viewModel.cur.data.comic.id(), scale: scale}, function(data) { loadSubscriptions(true, function(data) { subs = data; } )});
}