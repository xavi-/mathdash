function grade6() {
	var rnd = Math.random();
	var num1, num2;

	if(rnd < 0.10) { // Addition
		num1 = Math.floor(50 * Math.random());
		num2 = Math.floor(50 * Math.random());
		return { question: num1 + " + " + num2, answer: num1 + num2 };
	} else if(rnd < 0.15) { // Subtracion
		num1 = Math.floor(60 * Math.random());
		num2 = Math.floor(num1 * Math.random());
		return { question: num1 + " - " + num2, answer: num1 - num2 };
	} else if(rnd < 0.25) { // Multiply
		num1 = Math.floor(12 * Math.random());
		num2 = Math.floor(12 * Math.random());
		return { question: num1 + " * " + num2, answer: num1 * num2 };
	} else if(rnd < 0.35) { // Divide
		num1 = Math.floor(11 * Math.random()) + 1;
		num2 = Math.floor(11 * Math.random()) + 1;
		
		var ans = num1 * num2;
		return { question: ans + " / " + num1, answer: num2 };
	} else if(rnd < 0.45) { // 101 * any number
		num1 = Math.floor(90 * Math.random()) + 10;
		return { question: "101 * " + num1, answer: num1 * 101 };
	} else if(rnd < 0.65) { // 50 * any number
		num1 = Math.floor(90 * Math.random()) + 5;
		return { question: "50 * " + num1, answer: num1 * 50 };
	} else if(rnd < 0.85) { // 25 * any number
		num1 = Math.floor(90 * Math.random()) + 5;
		return { question: "25 * " + num1, answer: num1 * 25 };
	} else { // 11 * any number
		num1 = Math.floor(90 * Math.random()) + 5;
		return { question: "11 * " + num1, answer: num1 * 11 };
	}
}

module.exports = grade6;