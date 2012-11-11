var defaults = { max: 100, min: 5, tutorial: false };

function times50(options) {
	options = options || defaults;
	if(options.max == null) { options.max = defaults.max; }
	if(options.min == null) { options.min = defaults.min; }

	var num =  (Math.random() * (options.max - options.min) + options.min) >> 0;

	var result = {
		question: (Math.random() > 0.3 ? num + " * 50" : "50 * " + num),
		answer: num * 50
	};

	if(!options.tutorial) { return result; }

	var last2Digits = ((num % 2) * 50);
	if(last2Digits < 10) { last2Digits = "0" + last2Digits; }

	var subResults = [
		num + " / 2 = <em>" + ((num / 2) >> 0) + "</em>" + (num % 2 === 0 ? ".0" : ".5"),
		((num / 2) >> 0) + " * 100 = <em>" + (((num / 2) >> 0) * 100) + "</em>",
		"remainder of " + num + " / 2 is <em>" + (num % 2) + "</em>; " + (num % 2) + " * 50 = <em>" + last2Digits + "</em>",
		((num / 2) >> 0) * 100 + " + " + last2Digits + " = <em>" + num * 50 + "</em>"
	];

	var tempAnswers = [
		"????",
		"<em>" + ((num / 2) >> 0) + "</em>??",
		((num / 2) >> 0) + "<em>" + last2Digits + "</em>",
	];

	result.tutorial = {
		"sub-results": subResults,
		"temp-answers": tempAnswers
	};

	return result;
}

module.exports = times50;