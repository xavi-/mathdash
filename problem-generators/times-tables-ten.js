function timesTablesTens() {
	var num1 = Math.floor(12 * Math.random());
	var num2 = Math.floor(12 * Math.random());

	if(Math.random() < 0.5) { num1 *= 10; } else { num2 *= 10; }

	if(Math.random() < 0.1) {
		if(num1 < 13) { num1 *= 10; }
		if(num2 < 13) { num2 *= 10; }
	}

	return { question: num1 + " * " + num2, answer: num1 * num2 };
}

module.exports = timesTablesTens;