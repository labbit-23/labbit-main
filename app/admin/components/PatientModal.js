// app/admin/components/PatientModal.js
import SharedPatientModal from '../../components/SharedPatientModal';

export default function PatientModal({ isOpen, onClose, onSubmit }) {
  return (
    <SharedPatientModal
      isOpen={isOpen}
      onClose={onClose}
      onPatientCreated={onSubmit}
    />
  );
}