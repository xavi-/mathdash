var grade6 = require("./grade6");

function grade7() {
	var rnd = Math.random();
	var num1, num2, ones1, ones2;

	if(rnd < 0.06) { // Ones place add to 10, same tens place
		var tens = Math.floor(10 * Math.random());
		var ones = Math.floor(10 * Math.random());
		num1 = tens * 10 + ones;
		num2 = tens * 10 + (10 - ones);
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else if(rnd < 0.12) { // Two numbers near 100 (but less than)
		ones1 = Math.floor(10 * Math.random());
		ones2 = Math.floor(10 * Math.random());
		num1 = 100 - ones1;
		num2 = 100 - ones2;
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else if(rnd < 0.18) { // Two numbers near 100 (but less then)
		ones1 = Math.floor(10 * Math.random());
		ones2 = Math.floor(10 * Math.random());
		num1 = 100 + ones1;
		num2 = 100 + ones2;
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else {
		return grade6();
	}
}

module.exports = grade7;