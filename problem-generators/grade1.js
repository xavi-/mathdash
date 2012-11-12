function grade1() {
	var num1, num2;

	if(Math.random() < 0.6) { // Addition
		num1 = Math.floor(10 * Math.random());
		num2 = Math.floor(10 * Math.random());
		return { question: num1 + " + " + num2, answer: num1 + num2 };
	} else { // Subtracion
		num1 = Math.floor(10 * Math.random());
		num2 = Math.floor(num1 * Math.random());
		return { question: num1 + " - " + num2, answer: num1 - num2 };
	}
}

module.exports = grade1;