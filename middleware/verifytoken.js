const jwt = require("jsonwebtoken")
const UserModel = require("../models/users");
const moment = require("moment");

const verifyToken = async (req, res, next) => {
	try {
		jwt.verify(req.headers.token, 'cryptobotapi', async function (err, decoded) {
			if (err) {
				res.status(401).send({
					error: true,
					message: "Token not verified",
					err
				})
			} else {
				const date1 = moment(Date.now()).unix();
				const date2 = moment(decoded.expDate).unix();

				if (date1 > date2) {
					res.status(401).send({
						error: true,
						message: "Token expired"
					})
				} else {
					const user = await UserModel.findOne({
						_id: decoded.userId
					})

					if (!user) {
						res.status(404).send({
							error: true,
							message: "User not found"
						})
					} else {
						req.user = user
						next()
					}
				}
			}
		});
	} catch (error) {
		console.error(error, "<<-- Error in verify token")
		res.status(500).send({
			error: true,
			message: "Internal server error"
		})
	}
}

module.exports = verifyToken