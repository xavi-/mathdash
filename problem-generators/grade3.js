function grade3() {
	var rnd = Math.random();
	var num1, num2, num3;

	if(rnd < 0.25) { // Addition
		num1 = Math.floor(20 * Math.random());
		num2 = Math.floor(20 * Math.random());
		return { question: num1 + " + " + num2, answer: num1 + num2 };
	} else if(rnd < 0.5) { // Subtracion
		num1 = Math.floor(30 * Math.random());
		num2 = Math.floor(num1 * Math.random());
		return { question: num1 + " - " + num2, answer: num1 - num2 };
	} else if(rnd < 0.8) { // Multiply
		num1 = Math.floor(8 * Math.random());
		num2 = Math.floor(8 * Math.random());
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else { // 3 Add
		num1 = Math.floor(8 * Math.random());
		num2 = Math.floor(8 * Math.random());
		num3 = Math.floor(8 * Math.random());
		return { question: num1 + " + " + num2 + " + " + num3, answer: num1 + num2 + num3 };
	}
}

module.exports = grade3;