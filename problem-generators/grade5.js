function grade5() {
	var rnd = Math.random();
	var num1, num2, num3;

	if(rnd < 0.15) { // Addition
		num1 = Math.floor(50 * Math.random());
		num2 = Math.floor(50 * Math.random());
		return { question: num1 + " + " + num2, answer: num1 + num2 };
	} else if(rnd < 0.35) { // Subtracion
		num1 = Math.floor(60 * Math.random());
		num2 = Math.floor(num1 * Math.random());
		return { question: num1 + " - " + num2, answer: num1 - num2 };
	} else if(rnd < 0.55) { // Multiply
		num1 = Math.floor(12 * Math.random());
		num2 = Math.floor(12 * Math.random());
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else if(rnd < 0.7) { // Multiply
		num1 = Math.floor(8 * Math.random()) + 4;
		num2 = Math.floor(10 * Math.random()) + 2;
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else if(rnd < 0.85) {
		num1 = Math.floor(12 * Math.random());
		num2 = Math.floor(12 * Math.random());
		num3 = Math.floor(12 * Math.random());
		return { question: num1 + " + " + num2 + " + " + num3, answer: num1 + num2 + num3 };
	} else { // Divide
		num1 = Math.floor(11 * Math.random()) + 1;
		num2 = Math.floor(11 * Math.random()) + 1;
		var ans = num1 * num2;
		return { question: ans + " / " + num1, answer: num2 };
	}
}

module.exports = grade5;