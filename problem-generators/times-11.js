var defaults = { max: 100, min: 5, tutorial: false };

function times11(options) {
	options = options || defaults;
	if(options.max == null) { options.max = defaults.max; }
	if(options.min == null) { options.min = defaults.min; }

	var num =  (Math.random() * (options.max - options.min) + options.min) >> 0;

	var result = {
		question: (Math.random() > 0.3 ? num + " * 11" : "11 * " + num),
		answer: num * 11
	};

	if(!options.tutorial) { return result; }

	var firstDigit = ((num / 10) >> 0);
	var secondDigit = (num % 10);
	var sumOfDigits = firstDigit + secondDigit;

	var subResults = [
		firstDigit + "<em>" + secondDigit + "</em>",
		firstDigit + " + " + secondDigit + " = <em>" + (sumOfDigits < 10 ? "0" : "") + sumOfDigits + "</em>",
		((sumOfDigits / 10) >> 0) + "<em>" + (sumOfDigits % 10) + "</em>",
		firstDigit + " + " + ((sumOfDigits / 10) >> 0) + " = <em>" + (firstDigit + (sumOfDigits / 10) >> 0) + "</em>",
		"<em>" + firstDigit + "</em>" + secondDigit,
		"<em>" + ((sumOfDigits / 10) >> 0) + "</em>" + (sumOfDigits % 10)
	];

	var tempAnswers = [
		"???",
		"??<em>" + secondDigit + "</em>",
		"?<em>" + (sumOfDigits % 10) + "</em>" + secondDigit,
		"<em>" + (firstDigit + (sumOfDigits / 10) >> 0) + "</em>" + (sumOfDigits % 10) + "" + secondDigit,
	];

	result.tutorial = {
		"sub-results": subResults,
		"temp-answers": tempAnswers
	};

	return result;
}

module.exports = times11;