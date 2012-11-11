var defaults = { max: 100, min: 5, tutorial: false };
var decimal = [ ".0", ".25", ".5", ".75" ];

function times25(options) {
	options = options || defaults;
	if(options.max == null) { options.max = defaults.max; }
	if(options.min == null) { options.min = defaults.min; }

	var num =  (Math.random() * (options.max - options.min) + options.min) >> 0;

	var result = {
		question: (Math.random() > 0.3 ? num + " * 25" : "25 * " + num),
		answer: num * 25
	};

	if(!options.tutorial) { return result; }

	var last2Digits = ((num % 4) * 25);
	if(last2Digits < 10) { last2Digits = "0" + last2Digits; }

	var subResults = [
		num + " / 4 = <em>" + ((num / 4) >> 0) + "</em>" + decimal[num % 4],
		((num / 4) >> 0) + " * 100 = <em>" + (((num / 4) >> 0) * 100) + "</em>",
		"remainder of " + num + " / 4 is <em>" + (num % 4) + "</em>; " + (num % 4) + " * 25 = <em>" + last2Digits + "</em>",
		((num / 4) >> 0) * 100 + " + " + last2Digits + " = <em>" + num * 25 + "</em>"
	];

	var tempAnswers = [
		"????",
		"<em>" + ((num / 4) >> 0) + "</em>??",
		((num / 4) >> 0) + "<em>" + last2Digits + "</em>",
	];

	result.tutorial = {
		"sub-results": subResults,
		"temp-answers": tempAnswers
	};

	return result;
}

module.exports = times25;