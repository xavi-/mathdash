function grade2() {
	var rnd = Math.random();
	var num1, num2, num3;

	if(rnd < 0.333) { // Addition
		num1 = Math.floor(15 * Math.random());
		num2 = Math.floor(15 * Math.random());
		return { question: num1 + " + " + num2, answer: num1 + num2 };
	} else if(rnd < 0.666) { // Subtracion
		num1 = Math.floor(20 * Math.random());
		num2 = Math.floor(num1 * Math.random());
		return { question: num1 + " - " + num2, answer: num1 - num2 };
	} else {
		num1 = Math.floor(6 * Math.random());
		num2 = Math.floor(4 * Math.random());
		num3 = Math.floor(6 * Math.random());
		return { question: num1 + " + " + num2 + " + " + num3, answer: num1 + num2 + num3 };
	}
}

module.exports = grade2;