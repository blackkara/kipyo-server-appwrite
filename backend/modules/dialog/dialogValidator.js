import { body, validationResult } from 'express-validator';

export const initDialogValidation = [
  body('userId')
    .notEmpty()
    .withMessage('userId is required')
    .isString()
    .withMessage('userId must be a string'),

  body('occupantId')
    .notEmpty()
    .withMessage('occupantId is required')
    .isString()
    .withMessage('occupantId must be a string')
    .custom((value, { req }) => {
      if (value === req.body.userId) {
        throw new Error('userId and occupantId cannot be the same');
      }
      return true;
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const requestId = req.requestId;
      const duration = Date.now() - (req.startTime || Date.now());

      return res.status(400).json({
        success: false,
        code: 400,
        type: 'general_argument_invalid',
        message: errors.array()[0].msg,
        requestId: requestId,
        duration: duration,
        errors: errors.array()
      });
    }
    next();
  }
];


export const createDirectDialogValidation = [
  body('userId')
    .notEmpty()
    .withMessage('userId is required')
    .isString()
    .withMessage('userId must be a string'),

  body('occupantId')
    .notEmpty()
    .withMessage('occupantId is required')
    .isString()
    .withMessage('occupantId must be a string')
    .custom((value, { req }) => {
      if (value === req.body.userId) {
        throw new Error('userId and occupantId cannot be the same');
      }
      return true;
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const requestId = Math.random().toString(36).substring(7);
      const duration = Date.now() - (req.startTime || Date.now());

      return res.status(400).json({
        success: false,
        code: 400,
        type: 'general_argument_invalid',
        message: errors.array()[0].msg,
        requestId: requestId,
        duration: duration,
        errors: errors.array()
      });
    }
    next();
  }
];
