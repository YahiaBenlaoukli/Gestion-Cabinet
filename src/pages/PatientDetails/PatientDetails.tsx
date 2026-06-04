import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function PatientDetails() {
    // Grab the 'id' from the route /patient/:id
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [patientData, setPatientData] = useState(null);

    useEffect(() => {
        // You now have the ID! Use it to fetch the data via IPC or an API.
        console.log("Fetching data for patient ID:", id);

        // Example: window.electronAPI.getPatient(id).then(setPatientData);
    }, [id]);

    return (
        <div>
            <button onClick={() => navigate(-1)}>Back to Table</button>
            <h2>Patient Details for ID: {id}</h2>
            {/* Render your extra info here */}
        </div>
    );
}