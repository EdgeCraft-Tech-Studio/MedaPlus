class PaymentServiceError(Exception):
    pass


class PaymentValidationError(PaymentServiceError):
    pass


class DuplicateTransactionError(PaymentServiceError):
    pass


class PaymentProviderError(PaymentServiceError):
    pass
