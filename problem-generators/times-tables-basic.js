function timesTablesBasic() {
	var num1 = Math.floor(12 * Math.random());
	var num2 = Math.floor(12 * Math.random());
	return { question: num1 + " * " + num2, answer: num1 * num2 };
}

module.exports = timesTablesBasic;